import { NextRequest, NextResponse } from "next/server";

import { resolveAvailableColumns, resolveJobsTable, type JobRecord } from "@/lib/jobs";
import { createSupabaseServer } from "@/lib/supabase/server";

const DEFAULT_NEW_JOB_STATUS = "pending_approval";

const asTrimmedString = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

const parsePayload = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? { ...(value as Record<string, unknown>) } : {};

const OMITTED_PAYLOAD_KEYS = new Set([
  "id",
  "created_at",
  "updated_at",
  "status",
  "line_notified",
  "line_notification_sent",
  "line_notification_flags",
  "approval_history",
  "review_history",
  "version_history",
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
  "attached_files",
  "receipt_files"
]);

const shouldOmitPayloadKey = (key: string): boolean => {
  if (OMITTED_PAYLOAD_KEYS.has(key)) {
    return true;
  }

  return (
    key.includes("approval") ||
    key.includes("review") ||
    key.includes("history") ||
    key.includes("doc_url") ||
    key.includes("storage_path") ||
    key.includes("attachment") ||
    key.includes("receipt_file") ||
    key.includes("line_notify")
  );
};

const sanitizePayloadForClone = (payload: Record<string, unknown>): Record<string, unknown> => {
  const nextPayload: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(payload)) {
    const normalizedKey = key.trim().toLowerCase();
    if (!normalizedKey || shouldOmitPayloadKey(normalizedKey)) {
      continue;
    }
    nextPayload[key] = value;
  }

  if ("receipt_no" in nextPayload) {
    nextPayload.receipt_no = "";
  }
  if ("receipt_date" in nextPayload) {
    nextPayload.receipt_date = "";
  }
  if ("attachments" in nextPayload) {
    nextPayload.attachments = [];
  }

  return nextPayload;
};

const buildCloneWriteData = ({
  source,
  availableColumns,
  userId
}: {
  source: JobRecord;
  availableColumns: Set<string>;
  userId: string | null;
}): Record<string, unknown> => {
  const sourcePayload = parsePayload(source.payload);
  const clonedPayload = sanitizePayloadForClone(sourcePayload);
  const writeData: Record<string, unknown> = {};
  const assignIfSupported = (column: string, value: unknown) => {
    if (availableColumns.has(column)) {
      writeData[column] = value;
    }
  };

  assignIfSupported("title", source.title ?? source.case_title ?? source.name ?? null);
  assignIfSupported("case_title", source.case_title ?? source.title ?? source.name ?? null);
  assignIfSupported("name", source.name ?? source.title ?? source.case_title ?? null);
  assignIfSupported("department", source.department ?? clonedPayload.department ?? null);
  assignIfSupported("subject", source.subject ?? clonedPayload.subject ?? null);
  assignIfSupported("tax_id", source.tax_id ?? clonedPayload.tax_id ?? null);
  assignIfSupported("payment_method", source.payment_method ?? clonedPayload.payment_method ?? "credit");
  assignIfSupported("assignee_emp_code", source.assignee_emp_code ?? clonedPayload.assignee_emp_code ?? null);
  assignIfSupported("loan_doc_no", null);
  assignIfSupported("receipt_date", null);
  assignIfSupported("status", DEFAULT_NEW_JOB_STATUS);
  assignIfSupported("doc_url", null);
  assignIfSupported("file_url", null);
  assignIfSupported("storage_path", null);
  assignIfSupported("paid_at", null);
  assignIfSupported("finished_at", null);
  assignIfSupported("revision_note", null);
  assignIfSupported("revision_requested_at", null);
  assignIfSupported("revision_requested_by", null);
  assignIfSupported("return_from_status", null);
  assignIfSupported("revision_phase", null);
  assignIfSupported(
    "revision_count",
    typeof source.revision_count === "number" && Number.isFinite(source.revision_count) ? source.revision_count : 0
  );
  assignIfSupported("updated_at", new Date().toISOString());
  assignIfSupported("payload", clonedPayload);

  if (availableColumns.has("user_id") && userId) {
    writeData.user_id = userId;
  }

  return writeData;
};

export async function POST(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const sourceJobId = asTrimmedString(id);
    if (!sourceJobId) {
      return NextResponse.json({ message: "ไม่พบรหัสงานที่ต้องการคัดลอก" }, { status: 400 });
    }

    const supabase = createSupabaseServer();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    const table = await resolveJobsTable(supabase);
    if (!table) {
      return NextResponse.json({ message: "ไม่พบตารางงานเอกสารในระบบ" }, { status: 500 });
    }

    const availableColumns = await resolveAvailableColumns(supabase, table);
    const selectColumns = [...availableColumns].join(",");

    let sourceQuery = supabase.from(table).select(selectColumns || "*").eq("id", sourceJobId).limit(1);
    if (user && availableColumns.has("user_id")) {
      sourceQuery = sourceQuery.eq("user_id", user.id);
    }
    const { data: sourceRows, error: sourceError } = await sourceQuery;
    if (sourceError) {
      return NextResponse.json({ message: `ไม่สามารถโหลดข้อมูลงานเดิมได้: ${sourceError.message}` }, { status: 400 });
    }

    const sourceJob = ((sourceRows ?? [])[0] ?? null) as unknown as JobRecord | null;
    if (!sourceJob) {
      return NextResponse.json({ message: "ไม่พบงานที่ต้องการคัดลอก หรือไม่มีสิทธิ์เข้าถึง" }, { status: 404 });
    }

    const writeData = buildCloneWriteData({
      source: sourceJob,
      availableColumns,
      userId: user?.id ?? null
    });

    const { data: insertedRows, error: insertError } = await supabase.from(table).insert(writeData).select("*").limit(1);
    if (insertError) {
      return NextResponse.json({ message: `ไม่สามารถสร้างงานใหม่จากต้นแบบได้: ${insertError.message}` }, { status: 400 });
    }

    const insertedJob = ((insertedRows ?? [])[0] ?? null) as unknown as JobRecord | null;
    if (!insertedJob?.id) {
      return NextResponse.json({ message: "สร้างงานใหม่ไม่สำเร็จ กรุณาลองอีกครั้ง" }, { status: 500 });
    }

    return NextResponse.json({
      job: insertedJob,
      sourceJobId,
      jobId: String(insertedJob.id)
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "ไม่สามารถคัดลอกงานเป็นงานใหม่ได้" },
      { status: 500 }
    );
  }
}
