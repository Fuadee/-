import { NextRequest, NextResponse } from "next/server";

import { sendLineGroupNotification } from "@/lib/line";
import { resolveAvailableColumns, resolveJobsTable, type JobRecord } from "@/lib/jobs";
import { createSupabaseServer } from "@/lib/supabase/server";

type UpdateStatusPayload = {
  status?: string;
  nextStatus?: string;
  action?: string;
};

const asTrimmedString = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

const parseJobPayload = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
};

const getGrandTotalFromPayload = (payload: Record<string, unknown>): number | null => {
  const rawItems = payload.items;
  if (!Array.isArray(rawItems)) {
    return null;
  }

  const total = rawItems.reduce((sum, item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return sum;
    }

    const amount = Number((item as Record<string, unknown>).amount);
    return Number.isFinite(amount) ? sum + amount : sum;
  }, 0);

  return Number.isFinite(total) ? total : null;
};

const formatAmount = (value: number | null): string =>
  typeof value === "number" && Number.isFinite(value)
    ? new Intl.NumberFormat("th-TH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(value)
    : "-";

const PAYMENT_DONE_STATUS = "ดำเนินการแล้วเสร็จ";

const buildPaymentDoneMessage = (job: JobRecord, user: { email?: string | null; user_metadata?: Record<string, unknown> | null }): string => {
  const payload = parseJobPayload(job.payload);
  const docNumber =
    asTrimmedString(payload.loan_doc_no) ||
    asTrimmedString(payload.receipt_no) ||
    asTrimmedString(job.loan_doc_no) ||
    asTrimmedString(job.receipt_no) ||
    asTrimmedString(job.id) ||
    "-";
  const title =
    asTrimmedString(payload.title) ||
    asTrimmedString(payload.case_title) ||
    asTrimmedString(payload.subject_detail) ||
    asTrimmedString(job.title) ||
    asTrimmedString(job.case_title) ||
    "-";
  const amount = formatAmount(getGrandTotalFromPayload(payload));
  const operatorName = asTrimmedString(user.user_metadata?.full_name) || asTrimmedString(user.email) || "-";

  return [
    "✅ ดำเนินการเบิกจ่ายแล้ว",
    `เลขที่เรื่อง: ${docNumber}`,
    `ชื่องาน: ${title}`,
    `วงเงิน: ${amount} บาท`,
    `ผู้ดำเนินการ: ${operatorName}`,
    `เวลา: ${new Date().toLocaleString("th-TH")}`
  ].join("\n");
};

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServer();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  const table = await resolveJobsTable(supabase);
  if (!table) {
    return NextResponse.json({ message: "ไม่พบตารางงานเอกสารที่รองรับในฐานข้อมูล" }, { status: 500 });
  }

  const availableColumns = await resolveAvailableColumns(supabase, table);
  let query = supabase.from(table).select("*").eq("id", params.id).limit(1);

  if (user && availableColumns.has("user_id")) {
    query = query.eq("user_id", user.id);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ message: `ไม่สามารถโหลดงานเอกสารได้: ${error.message}` }, { status: 500 });
  }

  const job = ((data ?? [])[0] ?? null) as JobRecord | null;
  if (!job) {
    return NextResponse.json({ message: "ไม่พบงานเอกสาร หรือไม่มีสิทธิ์เข้าถึง" }, { status: 404 });
  }

  return NextResponse.json({ job });
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServer();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: "กรุณาเข้าสู่ระบบก่อนอัปเดตสถานะ" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as UpdateStatusPayload | null;
  const action = asTrimmedString(body?.action);
  const nextStatus = asTrimmedString(body?.nextStatus || body?.status);

  const table = await resolveJobsTable(supabase);
  if (!table) {
    return NextResponse.json({ message: "ไม่พบตารางงานเอกสารที่รองรับในฐานข้อมูล" }, { status: 500 });
  }

  const availableColumns = await resolveAvailableColumns(supabase, table);
  if (!availableColumns.has("status") || !availableColumns.has("id")) {
    return NextResponse.json({ message: "ตารางงานเอกสารต้องมีคอลัมน์ id และ status" }, { status: 500 });
  }

  let fetchQuery = supabase.from(table).select("*").eq("id", params.id).limit(1);
  if (availableColumns.has("user_id")) {
    fetchQuery = fetchQuery.eq("user_id", user.id);
  }

  const { data: existingData, error: existingError } = await fetchQuery;
  if (existingError) {
    return NextResponse.json({ message: `ไม่สามารถโหลดงานเอกสารได้: ${existingError.message}` }, { status: 500 });
  }

  const existingJob = ((existingData ?? [])[0] ?? null) as JobRecord | null;
  if (!existingJob) {
    return NextResponse.json({ message: "ไม่พบงานเอกสาร หรือไม่มีสิทธิ์เข้าถึง" }, { status: 404 });
  }

  if (action === "mark_payment_done") {
    try {
      await sendLineGroupNotification(buildPaymentDoneMessage(existingJob, user));
    } catch (lineError) {
      console.error("Unable to send LINE payment completion notification:", lineError);
      return NextResponse.json({ message: "ส่ง LINE ไม่สำเร็จ กรุณาลองใหม่" }, { status: 502 });
    }

    const updates: Record<string, unknown> = { status: PAYMENT_DONE_STATUS };
    const nowIso = new Date().toISOString();
    if (availableColumns.has("paid_at")) {
      updates.paid_at = nowIso;
    }
    if (availableColumns.has("finished_at")) {
      updates.finished_at = nowIso;
    }

    let updateQuery = supabase.from(table).update(updates).eq("id", params.id).select("*").limit(1);
    if (availableColumns.has("user_id")) {
      updateQuery = updateQuery.eq("user_id", user.id);
    }

    const { data, error } = await updateQuery;
    if (error) {
      return NextResponse.json({ message: `อัปเดตสถานะไม่สำเร็จ: ${error.message}` }, { status: 500 });
    }

    const job = ((data ?? [])[0] ?? null) as JobRecord | null;
    if (!job) {
      return NextResponse.json({ message: "ไม่พบงานเอกสาร หรือไม่มีสิทธิ์เข้าถึง" }, { status: 404 });
    }

    return NextResponse.json({ job });
  }

  if (!nextStatus) {
    return NextResponse.json({ message: "กรุณาระบุสถานะที่ต้องการอัปเดต" }, { status: 400 });
  }

  let updateQuery = supabase.from(table).update({ status: nextStatus }).eq("id", params.id).select("*").limit(1);
  if (availableColumns.has("user_id")) {
    updateQuery = updateQuery.eq("user_id", user.id);
  }

  const { data, error } = await updateQuery;
  if (error) {
    return NextResponse.json({ message: `อัปเดตสถานะไม่สำเร็จ: ${error.message}` }, { status: 500 });
  }

  const job = ((data ?? [])[0] ?? null) as JobRecord | null;
  if (!job) {
    return NextResponse.json({ message: "ไม่พบงานเอกสาร หรือไม่มีสิทธิ์เข้าถึง" }, { status: 404 });
  }

  if (nextStatus === "paid") {
    try {
      await sendLineGroupNotification(buildPaymentDoneMessage(existingJob, user));
    } catch (lineError) {
      console.error("Unable to send LINE paid notification:", lineError);
    }
  }

  return NextResponse.json({ job });
}
