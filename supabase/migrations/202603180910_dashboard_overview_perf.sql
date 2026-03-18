create or replace function public.dashboard_overview_summary(p_user_id uuid)
returns table (
  total bigint,
  pending bigint,
  approved bigint,
  rejected bigint,
  completed bigint
)
language sql
stable
as $$
  select
    count(*)::bigint as total,
    count(*) filter (where status = any(array['pending', 'pending_review', 'pending_approval', 'awaiting_payment', 'รอตรวจ', 'รออนุมัติ', 'รอเบิกจ่าย']::text[]))::bigint as pending,
    count(*) filter (where status = any(array['approved', 'อนุมัติ', 'อนุมัติแล้ว']::text[]))::bigint as approved,
    count(*) filter (where status = any(array['rejected', 'needs_fix', 'ไม่อนุมัติ', 'รอการแก้ไข']::text[]))::bigint as rejected,
    count(*) filter (where status = any(array['completed', 'ดำเนินการแล้วเสร็จ']::text[]))::bigint as completed
  from public.generated_docs
  where user_id = p_user_id;
$$;

grant execute on function public.dashboard_overview_summary(uuid) to anon, authenticated, service_role;

create index if not exists idx_generated_docs_user_id on public.generated_docs (user_id);
create index if not exists idx_generated_docs_user_id_status on public.generated_docs (user_id, status);
create index if not exists idx_generated_docs_user_id_created_at_desc on public.generated_docs (user_id, created_at desc);

create index if not exists idx_doc_jobs_user_id on public.doc_jobs (user_id);
create index if not exists idx_doc_jobs_user_id_status on public.doc_jobs (user_id, status);
create index if not exists idx_doc_jobs_user_id_created_at_desc on public.doc_jobs (user_id, created_at desc);

create index if not exists idx_documents_user_id on public.documents (user_id);
create index if not exists idx_documents_user_id_status on public.documents (user_id, status);
create index if not exists idx_documents_user_id_created_at_desc on public.documents (user_id, created_at desc);

create index if not exists idx_jobs_user_id on public.jobs (user_id);
create index if not exists idx_jobs_user_id_status on public.jobs (user_id, status);
create index if not exists idx_jobs_user_id_created_at_desc on public.jobs (user_id, created_at desc);
