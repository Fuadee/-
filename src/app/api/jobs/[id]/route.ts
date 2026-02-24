import { NextRequest, NextResponse } from "next/server";

import { sendLineGroupNotification } from "@/lib/line";
import { resolveAvailableColumns, resolveJobsTable, type JobRecord } from "@/lib/jobs";
import { createSupabaseServer } from "@/lib/supabase/server";

type UpdateStatusPayload = {
  status?: string;
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
  const nextStatus = asTrimmedString(body?.status);
  if (!nextStatus) {
    return NextResponse.json({ message: "กรุณาระบุสถานะที่ต้องการอัปเดต" }, { status: 400 });
  }

  const table = await resolveJobsTable(supabase);
  if (!table) {
    return NextResponse.json({ message: "ไม่พบตารางงานเอกสารที่รองรับในฐานข้อมูล" }, { status: 500 });
  }

  const availableColumns = await resolveAvailableColumns(supabase, table);
  if (!availableColumns.has("status") || !availableColumns.has("id")) {
    return NextResponse.json({ message: "ตารางงานเอกสารต้องมีคอลัมน์ id และ status" }, { status: 500 });
  }

  let query = supabase.from(table).update({ status: nextStatus }).eq("id", params.id).select("*").limit(1);
  if (availableColumns.has("user_id")) {
    query = query.eq("user_id", user.id);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ message: `อัปเดตสถานะไม่สำเร็จ: ${error.message}` }, { status: 500 });
  }

  const job = ((data ?? [])[0] ?? null) as JobRecord | null;
  if (!job) {
    return NextResponse.json({ message: "ไม่พบงานเอกสาร หรือไม่มีสิทธิ์เข้าถึง" }, { status: 404 });
  }

  if (nextStatus === "paid") {
    const payload = parseJobPayload(job.payload);
    const docNumber =
      asTrimmedString(payload.loan_doc_no) ||
      asTrimmedString(payload.receipt_no) ||
      asTrimmedString(job.loan_doc_no) ||
      asTrimmedString(job.receipt_no) ||
      asTrimmedString(job.id) ||
      "-";
    const amount = formatAmount(getGrandTotalFromPayload(payload));
    const userName = asTrimmedString(user.user_metadata?.full_name) || asTrimmedString(user.email) || "-";

    try {
      await sendLineGroupNotification(`✅ ดำเนินการเบิกจ่ายแล้ว\nเลขที่เรื่อง: ${docNumber}\nวงเงิน: ${amount} บาท\nผู้ดำเนินการ: ${userName}\nเวลา: ${new Date().toLocaleString("th-TH")}`);
    } catch (lineError) {
      console.error("Unable to send LINE paid notification:", lineError);
    }
  }

  return NextResponse.json({ job });
}
