create or replace function public.dashboard_overview_summary(p_user_id uuid)
returns table (
  total bigint,
  pending bigint,
  precheck_pending bigint,
  approved bigint,
  rejected bigint,
  completed bigint
)
language sql
stable
as $$
  select
    count(*)::bigint as total,
    count(*) filter (where status = any(array['pending', 'document_pending', 'pending_review', 'pending_approval', 'awaiting_payment', 'รอตรวจ', 'รออนุมัติ', 'รอเบิกจ่าย']::text[]))::bigint as pending,
    count(*) filter (where status = any(array['precheck_pending']::text[]))::bigint as precheck_pending,
    count(*) filter (where status = any(array['approved', 'อนุมัติ', 'อนุมัติแล้ว']::text[]))::bigint as approved,
    count(*) filter (where status = any(array['rejected', 'needs_fix', 'ไม่อนุมัติ', 'รอการแก้ไข']::text[]))::bigint as rejected,
    count(*) filter (where status = any(array['completed', 'ดำเนินการแล้วเสร็จ']::text[]))::bigint as completed
  from public.generated_docs
  where user_id = p_user_id;
$$;
