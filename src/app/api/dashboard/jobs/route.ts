import { NextResponse } from "next/server";

import {
  DASHBOARD_PROJECTION_SELECT,
  mapProjectionRowToJobRecord,
  projectionEnabled,
  type DashboardProjectionRow
} from "@/lib/dashboardProjection";
import { resolveJobsSchemaForCandidates } from "@/lib/jobs";
import { createSupabaseServer } from "@/lib/supabase/server";

const DASHBOARD_FIELD_CANDIDATES = [
  "id",
  "title",
  "case_title",
  "name",
  "department",
  "created_at",
  "status",
  "tax_id",
  "payload",
  "user_id",
  "assignee_name",
  "assignee_id",
  "assignee",
  "assigned_to",
  "assigned_to_name",
  "requester_name",
  "created_by"
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

const asUserId = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const enrichJobsWithCreatorName = async (
  supabase: ReturnType<typeof createSupabaseServer>,
  jobs: Record<string, unknown>[]
): Promise<Record<string, unknown>[]> => {
  const userIds = [...new Set(jobs.map((job) => asUserId(job.user_id)).filter((value): value is string => Boolean(value)))];

  if (userIds.length === 0) {
    return jobs;
  }

  const { data: usersData, error: usersError } = await supabase.from("users").select("id,name").in("id", userIds);
  if (usersError || !Array.isArray(usersData)) {
    return jobs;
  }

  const nameById = new Map(
    usersData
      .map((rowValue) => {
        const row = rowValue as Record<string, unknown>;
        const nameValue = row.name;
        return {
          id: asUserId(row.id),
          name: typeof nameValue === "string" ? nameValue.trim() : ""
        };
      })
      .filter((row): row is { id: string; name: string } => Boolean(row.id) && Boolean(row.name))
      .map((row) => [row.id, row.name])
  );

  return jobs.map((job) => {
    const userId = asUserId(job.user_id);
    if (!userId || !nameById.has(userId)) {
      return job;
    }

    return {
      ...job,
      created_by_name: nameById.get(userId)
    };
  });
};

const isCompletedStatus = (value: unknown): boolean => {
  if (typeof value !== "string") {
    return false;
  }

  const normalized = value.trim();
  return normalized === "completed" || normalized === "ดำเนินการแล้วเสร็จ";
};

export async function GET() {
  const endRoute = createDashboardPerfTimer("api-dashboard-jobs-route");
  const supabase = createSupabaseServer();
  const endAuth = createDashboardPerfTimer("api-dashboard-jobs-auth");
  const {
    data: { user }
  } = await supabase.auth.getUser();
  endAuth();

  if (!user) {
    endRoute();
    return NextResponse.json({ message: "กรุณาเข้าสู่ระบบก่อนใช้งาน dashboard" }, { status: 401 });
  }

  if (projectionEnabled()) {
    const endProjectionQuery = createDashboardPerfTimer("api-dashboard-jobs-projection-query");
    const { data, error } = await supabase
      .from("dashboard_jobs_projection")
      .select(DASHBOARD_PROJECTION_SELECT)
      .eq("is_completed", false)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);
    endProjectionQuery();

    if (error) {
      endRoute();
      return NextResponse.json({ message: `ไม่สามารถโหลดข้อมูลงานเอกสารได้: ${error.message}` }, { status: 500 });
    }

    console.info("[dashboard-projection] api-dashboard-jobs", {
      source: "projection",
      queryCountPerRequest: 1,
      rows: (data ?? []).length
    });
    endRoute();
    return NextResponse.json({
      jobs: ((data ?? []) as DashboardProjectionRow[]).map(mapProjectionRowToJobRecord)
    });
  }

  const endResolveSchema = createDashboardPerfTimer("api-dashboard-jobs-schema-resolve");
  const { table, availableColumns } = await resolveJobsSchemaForCandidates(supabase, DASHBOARD_FIELD_CANDIDATES);
  endResolveSchema();

  if (!table) {
    endRoute();
    return NextResponse.json({ message: "ไม่พบตารางงานเอกสารที่รองรับในฐานข้อมูล" }, { status: 500 });
  }

  const selectedColumns = DASHBOARD_FIELD_CANDIDATES.filter(
    (column) => availableColumns.has(column) && column !== "user_id"
  );

  if (!selectedColumns.includes("id")) {
    endRoute();
    return NextResponse.json({ message: "ตารางงานเอกสารต้องมีคอลัมน์ id" }, { status: 500 });
  }

  let query = supabase.from(table).select(selectedColumns.join(","));

  const orderByColumn = availableColumns.has("created_at") ? "created_at" : "id";
  query = query.order(orderByColumn, { ascending: false }).limit(20);

  if (availableColumns.has("user_id")) {
    query = query.eq("user_id", user.id);
  }

  const endJobsQuery = createDashboardPerfTimer("api-dashboard-jobs-query");
  const { data, error } = await query;
  endJobsQuery();

  if (error) {
    endRoute();
    return NextResponse.json({ message: `ไม่สามารถโหลดข้อมูลงานเอกสารได้: ${error.message}` }, { status: 500 });
  }

  const endActiveFilter = createDashboardPerfTimer("api-dashboard-jobs-transform-filter-active");
  const activeJobs = ((data ?? []) as unknown as Record<string, unknown>[]).filter((job) => !isCompletedStatus(job.status));
  endActiveFilter();
  const endCreatorMap = createDashboardPerfTimer("api-dashboard-jobs-transform-enrich-creator");
  const jobs = await enrichJobsWithCreatorName(supabase, activeJobs);
  endCreatorMap();
  endRoute();

  return NextResponse.json({
    jobs
  });
}
