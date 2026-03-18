import { NextRequest, NextResponse } from "next/server";

import { sendLineGroupNotification } from "@/lib/line";
import { resolveAvailableColumns, resolveJobsTable, type JobRecord } from "@/lib/jobs";
import { createSupabaseServer } from "@/lib/supabase/server";
import { calculateVatBreakdown, type VatMode } from "@/lib/vat";

type UpdateStatusPayload = {
  status?: string;
  nextStatus?: string;
  action?: string;
  revisionNote?: string;
};

const asTrimmedString = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

const parseJobPayload = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
};

const toFiniteNumber = (value: unknown): number | null => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const pickFirstFiniteNumber = (sources: unknown[], keys: string[]): number | null => {
  for (const source of sources) {
    if (!source || typeof source !== "object" || Array.isArray(source)) {
      continue;
    }

    for (const key of keys) {
      const amount = toFiniteNumber((source as Record<string, unknown>)[key]);
      if (amount !== null) {
        return amount;
      }
    }
  }

  return null;
};

const getGrandTotalFromPayload = (payload: Record<string, unknown>): number | null => {
  const rawItems = payload.items;
  if (!Array.isArray(rawItems)) {
    return null;
  }

  const vatModeRaw = payload.vat_mode;
  const vatMode: VatMode = vatModeRaw === "included" || vatModeRaw === "excluded" || vatModeRaw === "none" ? vatModeRaw : "included";

  const total = rawItems.reduce((sum, item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return sum;
    }

    const row = item as Record<string, unknown>;
    const lineTotal =
      toFiniteNumber(row.total) ??
      toFiniteNumber(row.line_total_num) ??
      toFiniteNumber(row.total_num) ??
      ((toFiniteNumber(row.qty) ?? 0) * (toFiniteNumber(row.price) ?? 0));

    if (!Number.isFinite(lineTotal)) {
      return sum;
    }

    const breakdown = calculateVatBreakdown(lineTotal, vatMode);
    return sum + breakdown.total;
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

const NEEDS_FIX_STATUS = "needs_fix";

const formatThaiDateTime = (date: Date): string => {
  const datePart = new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(date);
  const timePart = new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);

  return `${datePart} ${timePart}`;
};

const getOriginFromRequest = (request: NextRequest): string => {
  const envBaseUrl = asTrimmedString(process.env.NEXT_PUBLIC_APP_URL) || asTrimmedString(process.env.APP_URL) || asTrimmedString(process.env.BASE_URL);
  if (envBaseUrl) {
    return envBaseUrl.replace(/\/$/, "");
  }

  const origin = request.nextUrl.origin || `${request.headers.get("x-forwarded-proto") ?? "https"}://${request.headers.get("host") ?? ""}`;
  return origin.replace(/\/$/, "");
};

const getAssigneeDisplayNameFromJob = (job: JobRecord): string => {
  const payload = parseJobPayload(job.payload);

  return (
    asTrimmedString(payload.assignee) ||
    asTrimmedString(job.assignee) ||
    asTrimmedString(payload.assignee_name) ||
    asTrimmedString(job.assignee_name) ||
    asTrimmedString(payload.assigned_to_name) ||
    asTrimmedString(job.assigned_to_name) ||
    asTrimmedString(payload.receiver_name) ||
    asTrimmedString(job.receiver_name) ||
    asTrimmedString(payload.recipient_name) ||
    asTrimmedString(job.recipient_name) ||
    asTrimmedString(payload.delegate_name) ||
    asTrimmedString(job.delegate_name) ||
    asTrimmedString(payload.owner_name) ||
    asTrimmedString(job.owner_name)
  );
};

const resolveAssigneeId = (job: JobRecord): string => {
  const payload = parseJobPayload(job.payload);

  return (
    asTrimmedString(job.assignee_id) ||
    asTrimmedString(payload.assignee_id) ||
    asTrimmedString(job.assigned_to) ||
    asTrimmedString(payload.assigned_to)
  );
};

const tryResolveNameById = async (supabase: ReturnType<typeof createSupabaseServer>, assigneeId: string): Promise<string> => {
  if (!assigneeId) {
    return "";
  }

  const candidateTables = ["profiles", "users"];
  const candidateColumns = ["display_name", "full_name", "name"];

  for (const table of candidateTables) {
    const { data, error } = await supabase.from(table).select("*").eq("id", assigneeId).limit(1);
    if (error) {
      continue;
    }

    const row = (data ?? [])[0] as Record<string, unknown> | undefined;
    if (!row) {
      continue;
    }

    for (const column of candidateColumns) {
      const value = asTrimmedString(row[column]);
      if (value) {
        return value;
      }
    }
  }

  return "";
};

const buildNeedsFixLineMessage = (job: JobRecord, assigneeName: string, revisionNote: string, jobUrl: string, requestedAt: Date): string => {
  const payload = parseJobPayload(job.payload);
  const jobTitle =
    asTrimmedString(payload.title) ||
    asTrimmedString(payload.case_title) ||
    asTrimmedString(payload.subject_detail) ||
    asTrimmedString(job.title) ||
    asTrimmedString(job.case_title) ||
    "-";

  return [
    "🚨 ส่งกลับแก้ไขเอกสาร",
    `งาน: ${jobTitle}`,
    `ผู้รับมอบหมาย: ${assigneeName || "(ไม่ระบุชื่อ)"}`,
    `รายการที่ต้องแก้: ${revisionNote}`,
    `เวลา: ${formatThaiDateTime(requestedAt)}`,
    `ลิงก์ไปแก้ไข: ${jobUrl}`
  ].join("\n");
};

const buildPaymentDoneMessage = (job: JobRecord, user: { email?: string | null; user_metadata?: Record<string, unknown> | null }): string => {
  const payload = parseJobPayload(job.payload);
  const docNumber =
    asTrimmedString(payload.loan_doc_no) ||
    asTrimmedString(payload.receipt_no) ||
    asTrimmedString(job.loan_doc_no) ||
    asTrimmedString(job.receipt_no) ||
    asTrimmedString(job.id) ||
    "-";
  const jobTitle =
    asTrimmedString(payload.title) ||
    asTrimmedString(payload.case_title) ||
    asTrimmedString(payload.subject_detail) ||
    asTrimmedString(job.title) ||
    asTrimmedString(job.case_title) ||
    "-";
  // Prefer persisted net/grand total fields from job/payload before falling back to server-side VAT calculation.
  const formattedNetTotal = formatAmount(
    pickFirstFiniteNumber(
      [job, payload],
      ["total_net", "net_total", "grand_total", "total", "total_amount", "subtotal_incl_vat", "amount"]
    ) ?? getGrandTotalFromPayload(payload)
  );

  // Prefer assignee display name from document fields (ผู้ได้รับมอบหมาย), then owner/display name, then current user email.
  const assigneeName = getAssigneeDisplayNameFromJob(job) || asTrimmedString(user.user_metadata?.full_name) || "(ไม่ระบุชื่อ)";

  const thaiFormattedTime = new Date().toLocaleString("th-TH", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });

  return [
    "✅ ดำเนินการเบิกจ่ายแล้ว",
    `ใบเสร็จเลขที่: ${docNumber}`,
    `ชื่องาน: ${jobTitle}`,
    `วงเงิน: ${formattedNetTotal} บาท`,
    `ผู้ดำเนินการ: ${assigneeName}`,
    `เวลา: ${thaiFormattedTime}`
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
  const revisionNote = asTrimmedString(body?.revisionNote);

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

  if (nextStatus === NEEDS_FIX_STATUS) {
    if (!revisionNote) {
      return NextResponse.json({ message: "กรุณาระบุรายการที่ต้องแก้ไขก่อนส่งกลับ" }, { status: 400 });
    }

    const requiredColumns = ["revision_note", "revision_requested_at", "revision_requested_by"];
    const missingColumns = requiredColumns.filter((column) => !availableColumns.has(column));
    if (missingColumns.length > 0) {
      return NextResponse.json(
        { message: `ตารางงานเอกสารยังไม่พร้อมใช้งาน (${missingColumns.join(", ")}) กรุณาอัปเดต migration ก่อน` },
        { status: 500 }
      );
    }

    const nowIso = new Date().toISOString();
    const updates: Record<string, unknown> = {
      status: NEEDS_FIX_STATUS,
      revision_note: revisionNote,
      revision_requested_at: nowIso,
      revision_requested_by: user.id
    };

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

    const assigneeNameFromJob = getAssigneeDisplayNameFromJob(job);
    const assigneeNameById = await tryResolveNameById(supabase, resolveAssigneeId(job));
    const assigneeName = assigneeNameFromJob || assigneeNameById || "(ไม่ระบุชื่อ)";
    const origin = getOriginFromRequest(request);
    const jobUrl = `${origin}/?job=${encodeURIComponent(String(job.id ?? params.id))}`;
    const revisionRequestedAt = new Date(nowIso);
    const lineMessage = buildNeedsFixLineMessage(job, assigneeName, revisionNote, jobUrl, revisionRequestedAt);

    try {
      await sendLineGroupNotification(lineMessage);
    } catch (lineError) {
      console.error("Unable to send LINE needs-fix notification:", {
        error: lineError,
        jobId: params.id,
        assigneeName,
        revisionNote
      });
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
