import { NextResponse } from "next/server";

import { resolveAvailableColumns, resolveJobsTable } from "@/lib/jobs";
import { createSupabaseServer } from "@/lib/supabase/server";

const DASHBOARD_FIELD_CANDIDATES = ["id", "title", "case_title", "name", "created_at", "status", "user_id"] as const;

export async function GET() {
  const supabase = createSupabaseServer();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: "กรุณาเข้าสู่ระบบก่อนใช้งาน dashboard" }, { status: 401 });
  }

  const table = await resolveJobsTable(supabase);

  if (!table) {
    return NextResponse.json({ message: "ไม่พบตารางงานเอกสารที่รองรับในฐานข้อมูล" }, { status: 500 });
  }

  const availableColumns = await resolveAvailableColumns(supabase, table);
  const selectedColumns = DASHBOARD_FIELD_CANDIDATES.filter((column) => availableColumns.has(column));

  if (!selectedColumns.includes("id")) {
    return NextResponse.json({ message: "ตารางงานเอกสารต้องมีคอลัมน์ id" }, { status: 500 });
  }

  let query = supabase
    .from(table)
    .select(selectedColumns.join(","))
    .order("created_at", { ascending: false })
    .limit(20);

  if (availableColumns.has("user_id")) {
    query = query.eq("user_id", user.id);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ message: `ไม่สามารถโหลดข้อมูลงานเอกสารได้: ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({
    jobs: data ?? [],
    table,
    hasUserIdColumn: availableColumns.has("user_id"),
    currentUserId: user.id
  });
}
