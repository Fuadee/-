import { NextResponse } from "next/server";

import { resolveAvailableColumns, resolveJobsTable } from "@/lib/jobs";
import { createSupabaseServer } from "@/lib/supabase/server";

const COMPLETED_STATUSES = new Set(["completed", "ดำเนินการแล้วเสร็จ"]);
const CLONED_JOB_INITIAL_STATUS = "document_pending";

const asTrimmedString = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

const parsePayload = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? ({ ...(value as Record<string, unknown>) } as Record<string, unknown>) : {};

const sanitizePayloadForClone = (payload: Record<string, unknown>): Record<string, unknown> => {
  const clone = { ...payload };

  const fieldsToRemove = [
    "id",
    "status",
    "created_at",
    "updated_at",
    "line_notification_sent",
    "line_notified",
    "line_notify_sent_at",
    "notification_sent",
    "notification_flags",
    "approval_history",
    "review_history",
    "status_history",
    "revision_history",
    "version_history",
    "return_from_status",
    "revision_phase",
    "revision_count",
    "revision_note",
    "revision_requested_at",
    "revision_requested_by",
    "doc_url",
    "file_url",
    "storage_path",
    "generated_file_path",
    "document_no",
    "doc_no",
    "receipt_no",
    "receipt_date",
    "attachments",
    "attachment_ids",
    "files",
    "receipt_files"
  ] as const;

  for (const key of fieldsToRemove) {
    delete clone[key];
  }

  clone.receipt_no = "";
  clone.receipt_date = "";

  return clone;
};

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  const sourceJobId = asTrimmedString(params.id);

  if (!sourceJobId) {
    return NextResponse.json({ message: "ไม่พบรหัสงานต้นทาง" }, { status: 400 });
  }

  const supabase = createSupabaseServer();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: "กรุณาเข้าสู่ระบบก่อนดำเนินการ" }, { status: 401 });
  }

  const table = await resolveJobsTable(supabase);
  if (!table) {
    return NextResponse.json({ message: "ไม่พบตารางงานเอกสารที่รองรับในฐานข้อมูล" }, { status: 500 });
  }

  const availableColumns = await resolveAvailableColumns(supabase, table);
  const sourceSelect = ["id", "status", "payload", "title", "case_title", "name", "department", "subject", "tax_id", "payment_method", "assignee_emp_code", "loan_doc_no"]
    .filter((column) => availableColumns.has(column))
    .join(",");

  let query = supabase.from(table).select(sourceSelect || "id,payload,status").eq("id", sourceJobId).limit(1);
  if (availableColumns.has("user_id")) {
    query = query.eq("user_id", user.id);
  }

  const { data: sourceRows, error: sourceError } = await query;
  if (sourceError) {
    return NextResponse.json({ message: `ไม่สามารถโหลดข้อมูลงานเดิมได้: ${sourceError.message}` }, { status: 500 });
  }

  const sourceJob = Array.isArray(sourceRows) ? ((sourceRows[0] ?? null) as unknown as Record<string, unknown> | null) : null;
  if (!sourceJob) {
    return NextResponse.json({ message: "ไม่พบงานเดิมที่ต้องการคัดลอก หรือไม่มีสิทธิ์เข้าถึง" }, { status: 404 });
  }

  const normalizedStatus = asTrimmedString(sourceJob.status);
  if (!COMPLETED_STATUSES.has(normalizedStatus)) {
    return NextResponse.json({ message: "อนุญาตให้คัดลอกเป็นงานใหม่ได้เฉพาะงานที่เสร็จแล้วเท่านั้น" }, { status: 400 });
  }

  const sourcePayload = parsePayload(sourceJob.payload);
  const clonedPayload = sanitizePayloadForClone(sourcePayload);

  const cloneInsert: Record<string, unknown> = {};
  const title = asTrimmedString(sourceJob.title) || asTrimmedString(sourceJob.case_title) || asTrimmedString(sourceJob.name);

  if (availableColumns.has("title")) cloneInsert.title = title || asTrimmedString(clonedPayload.subject) || "งานใหม่จากการคัดลอก";
  if (availableColumns.has("case_title")) cloneInsert.case_title = asTrimmedString(sourceJob.case_title) || title || null;
  if (availableColumns.has("name")) cloneInsert.name = asTrimmedString(sourceJob.name) || title || null;
  if (availableColumns.has("department")) cloneInsert.department = asTrimmedString(clonedPayload.department) || asTrimmedString(sourceJob.department) || null;
  if (availableColumns.has("subject")) cloneInsert.subject = asTrimmedString(clonedPayload.subject) || asTrimmedString(sourceJob.subject) || null;
  if (availableColumns.has("tax_id")) cloneInsert.tax_id = asTrimmedString(clonedPayload.tax_id) || asTrimmedString(sourceJob.tax_id) || null;
  if (availableColumns.has("payment_method")) cloneInsert.payment_method = asTrimmedString(clonedPayload.payment_method) || asTrimmedString(sourceJob.payment_method) || "credit";
  if (availableColumns.has("assignee_emp_code")) cloneInsert.assignee_emp_code = asTrimmedString(clonedPayload.assignee_emp_code) || asTrimmedString(sourceJob.assignee_emp_code) || null;
  if (availableColumns.has("loan_doc_no")) cloneInsert.loan_doc_no = asTrimmedString(clonedPayload.loan_doc_no) || asTrimmedString(sourceJob.loan_doc_no) || null;

  if (availableColumns.has("status")) cloneInsert.status = CLONED_JOB_INITIAL_STATUS;
  if (availableColumns.has("payload")) cloneInsert.payload = clonedPayload;
  if (availableColumns.has("updated_at")) cloneInsert.updated_at = new Date().toISOString();
  if (availableColumns.has("user_id")) cloneInsert.user_id = user.id;

  const fieldsToResetAsNull = [
    "doc_url",
    "file_url",
    "storage_path",
    "paid_at",
    "finished_at",
    "return_from_status",
    "revision_phase",
    "revision_count",
    "revision_note",
    "revision_requested_at",
    "revision_requested_by"
  ] as const;

  for (const field of fieldsToResetAsNull) {
    if (availableColumns.has(field)) {
      cloneInsert[field] = null;
    }
  }

  const { data: insertedRows, error: insertError } = await supabase.from(table).insert(cloneInsert).select("id,status").limit(1);
  if (insertError) {
    return NextResponse.json({ message: `ไม่สามารถคัดลอกงานเป็นงานใหม่ได้: ${insertError.message}` }, { status: 500 });
  }

  const inserted = Array.isArray(insertedRows) ? ((insertedRows[0] ?? null) as { id?: unknown; status?: unknown } | null) : null;
  const clonedJobId = asTrimmedString(inserted?.id);

  if (!clonedJobId) {
    return NextResponse.json({ message: "สร้างงานใหม่ไม่สำเร็จ กรุณาลองอีกครั้ง" }, { status: 500 });
  }

  return NextResponse.json({
    jobId: clonedJobId,
    status: asTrimmedString(inserted?.status) || CLONED_JOB_INITIAL_STATUS,
    sourceJobId
  });
}
