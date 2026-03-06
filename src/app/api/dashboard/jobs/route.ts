import { NextResponse } from "next/server";

import { resolveJobsSchemaForCandidates } from "@/lib/jobs";
import { createSupabaseServer } from "@/lib/supabase/server";

const DASHBOARD_FIELD_CANDIDATES = ["id", "title", "case_title", "name", "created_at", "status", "tax_id", "payload", "user_id"] as const;

const isCompletedStatus = (value: unknown): boolean => {
  if (typeof value !== "string") {
    return false;
  }

  const normalized = value.trim();
  return normalized === "completed" || normalized === "ดำเนินการแล้วเสร็จ";
};

export async function GET() {
  const supabase = createSupabaseServer();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: "กรุณาเข้าสู่ระบบก่อนใช้งาน dashboard" }, { status: 401 });
  }

  const { table, availableColumns } = await resolveJobsSchemaForCandidates(supabase, DASHBOARD_FIELD_CANDIDATES);

  if (!table) {
    return NextResponse.json({ message: "ไม่พบตารางงานเอกสารที่รองรับในฐานข้อมูล" }, { status: 500 });
  }

  const selectedColumns = DASHBOARD_FIELD_CANDIDATES.filter(
    (column) => availableColumns.has(column) && column !== "user_id"
  );

  if (!selectedColumns.includes("id")) {
    return NextResponse.json({ message: "ตารางงานเอกสารต้องมีคอลัมน์ id" }, { status: 500 });
  }

  let query = supabase.from(table).select(selectedColumns.join(","));

  const orderByColumn = availableColumns.has("created_at") ? "created_at" : "id";
  query = query.order(orderByColumn, { ascending: false }).limit(20);

  if (availableColumns.has("user_id")) {
    query = query.eq("user_id", user.id);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ message: `ไม่สามารถโหลดข้อมูลงานเอกสารได้: ${error.message}` }, { status: 500 });
  }

  const jobs = ((data ?? []) as unknown as Record<string, unknown>[]).filter((job) => !isCompletedStatus(job.status));

  return NextResponse.json({
    jobs
  });
}
