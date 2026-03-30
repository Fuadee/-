import { NextResponse } from "next/server";

import { projectionEnabled } from "@/lib/dashboardProjection";
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
const isDashboardPerfLogEnabled = process.env.NODE_ENV === "development";
const formatDurationMs = (value: number): string => `${value.toFixed(3)}ms`;
const logDashboardPerf = (message: string): void => {
  if (!isDashboardPerfLogEnabled) {
    return;
  }

  console.info(message);
};
const createDashboardPerfTimer = (name: string): (() => void) => {
  const startedAt = performance.now();
  logDashboardPerf(`[dashboard-perf] ${name}-start`);
  return () => {
    logDashboardPerf(`[dashboard-perf] ${name}-end duration=${formatDurationMs(performance.now() - startedAt)}`);
  };
};

export async function GET() {
  const endRoute = createDashboardPerfTimer("api-dashboard-summary-route");
  try {
    const supabase = createSupabaseServer();

    const endAuth = createDashboardPerfTimer("api-dashboard-summary-auth");
    let user: Awaited<ReturnType<typeof supabase.auth.getUser>>["data"]["user"];
    try {
      ({
        data: { user }
      } = await supabase.auth.getUser());
    } finally {
      endAuth();
    }

    if (!user) {
      return NextResponse.json({ message: "กรุณาเข้าสู่ระบบก่อนใช้งาน dashboard" }, { status: 401 });
    }

    if (projectionEnabled()) {
      const endProjectionQuery = createDashboardPerfTimer("api-dashboard-summary-projection-query");
      const { data, error } = await supabase
        .from("dashboard_jobs_projection")
        .select("normalized_status,is_completed")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(200);
      endProjectionQuery();

      if (error) {
        return NextResponse.json({ message: `ไม่สามารถโหลดข้อมูลงานเอกสารได้: ${error.message}` }, { status: 500 });
      }

      let activeCount = 0;
      let pendingReviewCount = 0;
      let precheckPendingCount = 0;
      let needsFixCount = 0;
      let completedCount = 0;

      for (const row of (data ?? []) as { normalized_status?: string; is_completed?: boolean }[]) {
        if (row.is_completed) {
          completedCount += 1;
          continue;
        }

        activeCount += 1;
        if (row.normalized_status === "precheck_pending") precheckPendingCount += 1;
        if (row.normalized_status === "pending_review") pendingReviewCount += 1;
        if (row.normalized_status === "needs_fix") needsFixCount += 1;
      }

      console.info("[dashboard-projection] api-dashboard-summary", {
        source: "projection",
        queryCountPerRequest: 1,
        rows: (data ?? []).length
      });
      return NextResponse.json({
        summary: {
          activeCount,
          pendingReviewCount,
          precheckPendingCount,
          needsFixCount,
          completedCount
        },
        hasUserIdColumn: true,
        currentUserId: user.id
      });
    }

    const endResolveSchema = createDashboardPerfTimer("api-dashboard-summary-schema-resolve");
    let table: string | null;
    let availableColumns: Set<string>;
    try {
      ({ table, availableColumns } = await resolveJobsSchemaForCandidates(supabase, DASHBOARD_FIELD_CANDIDATES));
    } finally {
      endResolveSchema();
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

    const endSummaryQuery = createDashboardPerfTimer("api-dashboard-summary-query");
    let data: unknown[] | null;
    let error: { message: string } | null;
    try {
      ({ data, error } = await query);
    } finally {
      endSummaryQuery();
    }

    if (error) {
      return NextResponse.json({ message: `ไม่สามารถโหลดข้อมูลงานเอกสารได้: ${error.message}` }, { status: 500 });
    }

    const allJobs = (data ?? []) as unknown as Record<string, unknown>[];
    let activeCount = 0;
    let pendingReviewCount = 0;
    let precheckPendingCount = 0;
    let needsFixCount = 0;
    let completedCount = 0;

    const endSummaryTransform = createDashboardPerfTimer("api-dashboard-summary-transform-counts");
    for (const job of allJobs) {
      if (isCompletedStatus(job.status)) {
        completedCount += 1;
        continue;
      }

      activeCount += 1;
      const normalizedStatus = typeof job.status === "string" ? job.status.trim() : "";
      if (normalizedStatus === "precheck_pending") {
        precheckPendingCount += 1;
      }
      if (normalizedStatus === "pending_review") {
        pendingReviewCount += 1;
      }
      if (normalizedStatus === "needs_fix") {
        needsFixCount += 1;
      }
    }
    endSummaryTransform();

    return NextResponse.json({
      summary: {
        activeCount,
        pendingReviewCount,
        precheckPendingCount,
        needsFixCount,
        completedCount
      },
      hasUserIdColumn: availableColumns.has("user_id"),
      currentUserId: user.id
    });
  } finally {
    endRoute();
  }
}
