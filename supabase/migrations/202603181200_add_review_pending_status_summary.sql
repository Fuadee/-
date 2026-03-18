-- keep dashboard summary rpc aligned with new review_pending / revision_requested flow
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
    count(*) filter (where status = any(array['pending', 'pending_review', 'pending_approval', 'review_pending', 'awaiting_payment', 'รอตรวจ', 'รอตรวจสอบ', 'รออนุมัติ', 'รอเบิกจ่าย']::text[]))::bigint as pending,
    count(*) filter (where status = any(array['approved', 'อนุมัติ', 'อนุมัติแล้ว']::text[]))::bigint as approved,
    count(*) filter (where status = any(array['rejected', 'needs_fix', 'revision_requested', 'ไม่อนุมัติ', 'รอการแก้ไข', 'รอแก้ไข']::text[]))::bigint as rejected,
    count(*) filter (where status = any(array['completed', 'ดำเนินการแล้วเสร็จ']::text[]))::bigint as completed
  from public.generated_docs
  where user_id = p_user_id;
$$;

grant execute on function public.dashboard_overview_summary(uuid) to anon, authenticated, service_role;
