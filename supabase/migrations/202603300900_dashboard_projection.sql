create table if not exists public.dashboard_jobs_projection (
  job_id text primary key,
  user_id uuid null,
  title text not null,
  normalized_status text not null,
  raw_status text null,
  is_completed boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  created_by text null,
  requester_name text null,
  created_by_name text not null,
  assignee_name text null,
  department text null,
  tax_id text null,
  job_code text not null,
  search_text text not null,
  projected_at timestamptz not null default now()
);

create index if not exists dashboard_jobs_projection_user_active_created_idx
  on public.dashboard_jobs_projection (user_id, is_completed, created_at desc);

create index if not exists dashboard_jobs_projection_search_idx
  on public.dashboard_jobs_projection using gin (to_tsvector('simple', search_text));

create index if not exists dashboard_jobs_projection_updated_idx
  on public.dashboard_jobs_projection (updated_at desc);

create or replace function public.dashboard_normalize_status(raw_status text)
returns text
language plpgsql
immutable
as $$
declare
  normalized text;
begin
  normalized := btrim(coalesce(raw_status, ''));

  if normalized = '' or normalized = 'generated' then
    return 'pending_approval';
  end if;

  if normalized = 'ดำเนินการแล้วเสร็จ' then
    return 'completed';
  end if;

  if normalized in ('precheck_pending', 'document_pending', 'pending_approval', 'pending_review', 'awaiting_payment', 'needs_fix', 'completed') then
    return normalized;
  end if;

  return 'pending_approval';
end;
$$;

create or replace function public.dashboard_backfill_projection(p_job_id text default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected_rows integer := 0;
begin
  insert into public.dashboard_jobs_projection (
    job_id,
    user_id,
    title,
    normalized_status,
    raw_status,
    is_completed,
    is_active,
    created_at,
    updated_at,
    created_by,
    requester_name,
    created_by_name,
    assignee_name,
    department,
    tax_id,
    job_code,
    search_text,
    projected_at
  )
  select
    r.row_data ->> 'id' as job_id,
    case
      when coalesce(r.row_data ->> 'user_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then (r.row_data ->> 'user_id')::uuid
      else null
    end as user_id,
    coalesce(
      nullif(btrim(r.row_data ->> 'title'), ''),
      nullif(btrim(r.row_data ->> 'case_title'), ''),
      nullif(btrim(r.row_data ->> 'name'), ''),
      nullif(btrim(r.row_data -> 'payload' ->> 'title'), ''),
      nullif(btrim(r.row_data -> 'payload' ->> 'case_title'), ''),
      nullif(btrim(r.row_data -> 'payload' ->> 'name'), ''),
      nullif(btrim(r.row_data -> 'payload' ->> 'subject_detail'), ''),
      '(ไม่ระบุชื่องาน)'
    ) as title,
    public.dashboard_normalize_status(r.row_data ->> 'status') as normalized_status,
    nullif(btrim(r.row_data ->> 'status'), '') as raw_status,
    public.dashboard_normalize_status(r.row_data ->> 'status') = 'completed' as is_completed,
    public.dashboard_normalize_status(r.row_data ->> 'status') <> 'completed' as is_active,
    coalesce(nullif(r.row_data ->> 'created_at', '')::timestamptz, now()) as created_at,
    coalesce(nullif(r.row_data ->> 'updated_at', '')::timestamptz, nullif(r.row_data ->> 'created_at', '')::timestamptz, now()) as updated_at,
    nullif(btrim(r.row_data ->> 'created_by'), '') as created_by,
    nullif(btrim(coalesce(r.row_data ->> 'requester_name', r.row_data -> 'payload' ->> 'requester_name')), '') as requester_name,
    coalesce(
      nullif(btrim(u.name), ''),
      nullif(btrim(r.row_data ->> 'requester_name'), ''),
      nullif(btrim(r.row_data ->> 'created_by'), ''),
      nullif(btrim(r.row_data -> 'payload' ->> 'requester_name'), ''),
      'ไม่ระบุผู้สร้าง'
    ) as created_by_name,
    coalesce(
      nullif(btrim(r.row_data ->> 'assignee_name'), ''),
      nullif(btrim(r.row_data ->> 'assigned_to_name'), ''),
      nullif(btrim(r.row_data ->> 'assigned_to'), ''),
      nullif(btrim(r.row_data ->> 'assignee'), ''),
      nullif(btrim(r.row_data -> 'payload' ->> 'assignee'), ''),
      nullif(btrim(r.row_data -> 'payload' ->> 'assignee_name'), ''),
      nullif(btrim(r.row_data -> 'payload' ->> 'assigned_to_name'), ''),
      nullif(btrim(r.row_data -> 'payload' ->> 'assigned_to'), '')
    ) as assignee_name,
    coalesce(
      nullif(btrim(r.row_data ->> 'department'), ''),
      nullif(btrim(r.row_data -> 'payload' ->> 'department'), ''),
      'ไม่ระบุแผนก'
    ) as department,
    nullif(btrim(coalesce(r.row_data ->> 'tax_id', r.row_data -> 'payload' ->> 'tax_id')), '') as tax_id,
    case
      when coalesce(r.row_data ->> 'id', '') ~ '^[0-9]+$' then 'JOB-' || right(lpad(r.row_data ->> 'id', 5, '0'), 5)
      else 'JOB-' || right(coalesce(r.row_data ->> 'id', '00000'), 5)
    end as job_code,
    lower(
      concat_ws(
        ' ',
        coalesce(r.row_data ->> 'id', ''),
        coalesce(nullif(btrim(r.row_data ->> 'title'), ''), nullif(btrim(r.row_data ->> 'case_title'), ''), nullif(btrim(r.row_data ->> 'name'), ''), ''),
        public.dashboard_normalize_status(r.row_data ->> 'status'),
        coalesce(nullif(btrim(u.name), ''), nullif(btrim(r.row_data ->> 'requester_name'), ''), nullif(btrim(r.row_data -> 'payload' ->> 'requester_name'), ''), ''),
        coalesce(nullif(btrim(r.row_data ->> 'department'), ''), nullif(btrim(r.row_data -> 'payload' ->> 'department'), ''), ''),
        coalesce(nullif(btrim(r.row_data ->> 'tax_id'), ''), nullif(btrim(r.row_data -> 'payload' ->> 'tax_id'), ''), ''),
        coalesce(nullif(btrim(r.row_data ->> 'assignee_name'), ''), nullif(btrim(r.row_data ->> 'assigned_to_name'), ''), nullif(btrim(r.row_data ->> 'assigned_to'), ''), nullif(btrim(r.row_data ->> 'assignee'), ''), '')
      )
    ) as search_text,
    now() as projected_at
  from public.generated_docs gd
  cross join lateral (select to_jsonb(gd) as row_data) r
  left join public.users u on u.id::text = (r.row_data ->> 'user_id')
  where (p_job_id is null or r.row_data ->> 'id' = p_job_id)
    and nullif(btrim(r.row_data ->> 'id'), '') is not null
  on conflict (job_id)
  do update set
    user_id = excluded.user_id,
    title = excluded.title,
    normalized_status = excluded.normalized_status,
    raw_status = excluded.raw_status,
    is_completed = excluded.is_completed,
    is_active = excluded.is_active,
    created_at = excluded.created_at,
    updated_at = excluded.updated_at,
    created_by = excluded.created_by,
    requester_name = excluded.requester_name,
    created_by_name = excluded.created_by_name,
    assignee_name = excluded.assignee_name,
    department = excluded.department,
    tax_id = excluded.tax_id,
    job_code = excluded.job_code,
    search_text = excluded.search_text,
    projected_at = excluded.projected_at;

  get diagnostics affected_rows = row_count;
  return affected_rows;
end;
$$;

create or replace function public.dashboard_refresh_projection_for_user(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_rows integer := 0;
begin
  update public.dashboard_jobs_projection p
  set created_by_name = coalesce(nullif(btrim(u.name), ''), p.created_by_name),
      projected_at = now()
  from public.users u
  where u.id = p_user_id
    and p.user_id = p_user_id;

  get diagnostics updated_rows = row_count;
  return updated_rows;
end;
$$;
