create extension if not exists pgcrypto;

create table if not exists public.procure_cases (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  department text not null,
  status text not null default 'DRAFT',
  form_data jsonb not null default '{}'::jsonb,
  doc_url text,
  doc_version integer not null default 0,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.procure_case_events (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.procure_cases(id) on delete cascade,
  from_status text,
  to_status text not null,
  action text not null,
  note text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_procure_cases_updated_at on public.procure_cases;
create trigger trg_procure_cases_updated_at
before update on public.procure_cases
for each row execute function public.set_updated_at();

alter table public.procure_cases enable row level security;
alter table public.procure_case_events enable row level security;

create policy "procure_cases_select_own"
on public.procure_cases
for select
to authenticated
using (created_by = auth.uid());

create policy "procure_cases_insert_own"
on public.procure_cases
for insert
to authenticated
with check (created_by = auth.uid());

create policy "procure_cases_update_own"
on public.procure_cases
for update
to authenticated
using (created_by = auth.uid())
with check (created_by = auth.uid());

create policy "procure_cases_delete_own"
on public.procure_cases
for delete
to authenticated
using (created_by = auth.uid());

create policy "procure_case_events_select_own"
on public.procure_case_events
for select
to authenticated
using (
  exists (
    select 1
    from public.procure_cases c
    where c.id = case_id and c.created_by = auth.uid()
  )
);

create policy "procure_case_events_insert_own"
on public.procure_case_events
for insert
to authenticated
with check (
  created_by = auth.uid()
  and exists (
    select 1
    from public.procure_cases c
    where c.id = case_id and c.created_by = auth.uid()
  )
);

insert into storage.buckets (id, name, public)
values ('docs', 'docs', false)
on conflict (id) do nothing;

create policy "docs_upload_own_case"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'docs'
  and (storage.foldername(name))[1] in (
    select c.id::text from public.procure_cases c where c.created_by = auth.uid()
  )
);

create policy "docs_select_own_case"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'docs'
  and (storage.foldername(name))[1] in (
    select c.id::text from public.procure_cases c where c.created_by = auth.uid()
  )
);

create policy "docs_update_own_case"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'docs'
  and (storage.foldername(name))[1] in (
    select c.id::text from public.procure_cases c where c.created_by = auth.uid()
  )
)
with check (
  bucket_id = 'docs'
  and (storage.foldername(name))[1] in (
    select c.id::text from public.procure_cases c where c.created_by = auth.uid()
  )
);

create policy "docs_delete_own_case"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'docs'
  and (storage.foldername(name))[1] in (
    select c.id::text from public.procure_cases c where c.created_by = auth.uid()
  )
);
