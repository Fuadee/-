import { NextResponse } from "next/server";

import { resolveJobsSchemaForCandidates } from "@/lib/jobs";
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
  "created_at",
  "status",
  "user_id"
] as const;

export async function GET() {
  console.time("dashboard-summary-route-total");
  try {
    const supabase = createSupabaseServer();

    console.time("dashboard-summary-auth-user");
    let user: Awaited<ReturnType<typeof supabase.auth.getUser>>["data"]["user"];
    try {
      ({
        data: { user }
      } = await supabase.auth.getUser());
    } finally {
      console.timeEnd("dashboard-summary-auth-user");
    }

    if (!user) {
      return NextResponse.json({ message: "กรุณาเข้าสู่ระบบก่อนใช้งาน dashboard" }, { status: 401 });
    }

    console.time("dashboard-summary-resolve-schema");
    let table: string | null;
    let availableColumns: Set<string>;
    try {
      ({ table, availableColumns } = await resolveJobsSchemaForCandidates(supabase, DASHBOARD_FIELD_CANDIDATES));
    } finally {
      console.timeEnd("dashboard-summary-resolve-schema");
    }

    if (!table) {
      return NextResponse.json({ message: "ไม่พบตารางงานเอกสารที่รองรับในฐานข้อมูล" }, { status: 500 });
    }

    const selectedColumns = DASHBOARD_FIELD_CANDIDATES.filter((column) => availableColumns.has(column));

    if (!selectedColumns.includes("id")) {
      return NextResponse.json({ message: "ตารางงานเอกสารต้องมีคอลัมน์ id" }, { status: 500 });
    }

    let query = supabase.from(table).select(selectedColumns.join(","));

    const orderByColumn = availableColumns.has("created_at") ? "created_at" : "id";
    query = query.order(orderByColumn, { ascending: false }).limit(20);

    if (availableColumns.has("user_id")) {
      query = query.eq("user_id", user.id);
    }

    console.time("dashboard-summary-query");
    let data: unknown[] | null;
    let error: { message: string } | null;
    try {
      ({ data, error } = await query);
    } finally {
      console.timeEnd("dashboard-summary-query");
    }

    if (error) {
      return NextResponse.json({ message: `ไม่สามารถโหลดข้อมูลงานเอกสารได้: ${error.message}` }, { status: 500 });
    }

    const allJobs = (data ?? []) as unknown as Record<string, unknown>[];
    let activeCount = 0;
    let pendingReviewCount = 0;
    let needsFixCount = 0;
    let completedCount = 0;

    for (const job of allJobs) {
      if (isCompletedStatus(job.status)) {
        completedCount += 1;
        continue;
      }

      activeCount += 1;
      const normalizedStatus = typeof job.status === "string" ? job.status.trim() : "";
      if (normalizedStatus === "pending_review" || normalizedStatus === "review_pending" || normalizedStatus === "รอตรวจสอบ") {
        pendingReviewCount += 1;
      }
      if (normalizedStatus === "needs_fix" || normalizedStatus === "revision_requested" || normalizedStatus === "รอแก้ไข") {
        needsFixCount += 1;
      }
    }

    return NextResponse.json({
      summary: {
        activeCount,
        pendingReviewCount,
        needsFixCount,
        completedCount
      },
      hasUserIdColumn: availableColumns.has("user_id"),
      currentUserId: user.id
    });
  } finally {
    console.timeEnd("dashboard-summary-route-total");
  }
}
