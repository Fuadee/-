import { NextResponse } from "next/server";

import { resolveAvailableColumns, resolveJobsTable } from "@/lib/jobs";
import { createSupabaseServer } from "@/lib/supabase/server";

const isCompletedStatus = (value: unknown): boolean => {
  if (typeof value !== "string") {
    return false;
  }

  const normalized = value.trim();
  return normalized === "completed" || normalized === "ดำเนินการแล้วเสร็จ";
};

const DASHBOARD_FIELD_CANDIDATES = [
  "id",
  "title",
  "case_title",
  "name",
  "created_at",
  "status",
  "user_id",
  "tax_id",
  "payload"
] as const;

export async function GET() {
  const supabase = createSupabaseServer();
  console.time("summary-auth-user");
  const {
    data: { user }
  } = await supabase.auth.getUser();
  console.timeEnd("summary-auth-user");

  if (!user) {
    return NextResponse.json({ message: "กรุณาเข้าสู่ระบบก่อนใช้งาน dashboard" }, { status: 401 });
  }

  console.time("summary-resolve-table");
  const table = await resolveJobsTable(supabase);
  console.timeEnd("summary-resolve-table");

  if (!table) {
    return NextResponse.json({ message: "ไม่พบตารางงานเอกสารที่รองรับในฐานข้อมูล" }, { status: 500 });
  }

  console.time("summary-resolve-columns");
  const availableColumns = await resolveAvailableColumns(supabase, table);
  console.timeEnd("summary-resolve-columns");
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

  console.time("summary-jobs-query");
  const { data, error } = await query;
  console.timeEnd("summary-jobs-query");

  if (error) {
    return NextResponse.json({ message: `ไม่สามารถโหลดข้อมูลงานเอกสารได้: ${error.message}` }, { status: 500 });
  }

  const allJobs = (data ?? []) as unknown as Record<string, unknown>[];
  const jobs: Record<string, unknown>[] = [];

  let completedCount = 0;
  for (const job of allJobs) {
    if (isCompletedStatus(job.status)) {
      completedCount += 1;
      continue;
    }

    jobs.push(job);
  }

  return NextResponse.json({
    jobs,
    summary: {
      completedCount
    },
    table,
    hasUserIdColumn: availableColumns.has("user_id"),
    currentUserId: user.id
  });
}
