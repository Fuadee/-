import { cache } from "react";

import { resolveJobsSchemaForCandidates, type JobRecord } from "@/lib/jobs";
import { createSupabaseServer } from "@/lib/supabase/server";

export type DashboardJobsResponse = {
  jobs: JobRecord[];
  hasUserIdColumn: boolean;
  currentUserId: string | null;
  isPartial: boolean;
};

const DASHBOARD_JOBS_FIELD_CANDIDATES = [
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
const DASHBOARD_FETCH_MODE = "direct-data-access";
const DASHBOARD_INITIAL_ACTIVE_JOBS_LIMIT = 10;
const DASHBOARD_FAST_TABLE = process.env.DASHBOARD_JOBS_FAST_TABLE?.trim() || "generated_docs";
const isDashboardPerfLogEnabled = process.env.NODE_ENV === "development" || process.env.DASHBOARD_PERF_LOG === "1";

const formatDurationMs = (value: number): string => `${value.toFixed(3)}ms`;
const logDashboardPerf = (message: string): void => {
  if (!isDashboardPerfLogEnabled) {
    return;
  }

  console.info(message);
};

const createDashboardPerfTimer = (name: string, metadata?: string): (() => void) => {
  const startedAt = performance.now();
  logDashboardPerf(`[dashboard-perf] ${name}-start${metadata ? ` ${metadata}` : ""}`);
  return () => {
    logDashboardPerf(`[dashboard-perf] ${name}-end duration=${formatDurationMs(performance.now() - startedAt)}${metadata ? ` ${metadata}` : ""}`);
  };
};

type DashboardPerfMark = {
  name: string;
  durationMs: number;
  metadata?: string;
};

const createDashboardPerfTrace = (label: string): {
  requestId: string;
  measureAsync: <T>(name: string, fn: () => Promise<T>, metadata?: string) => Promise<T>;
  flush: (outcome: "ok" | "error") => void;
} => {
  const requestId = globalThis.crypto?.randomUUID?.().slice(0, 8) ?? Math.random().toString(36).slice(2, 10);
  const startedAt = performance.now();
  const marks: DashboardPerfMark[] = [];
  logDashboardPerf(`[dashboard-perf] ${label}-start request_id=${requestId}`);

  const measureAsync = async <T>(name: string, fn: () => Promise<T>, metadata?: string): Promise<T> => {
    const stepStartedAt = performance.now();
    logDashboardPerf(`[dashboard-perf] ${label}-${name}-start request_id=${requestId}${metadata ? ` ${metadata}` : ""}`);
    try {
      return await fn();
    } finally {
      const durationMs = performance.now() - stepStartedAt;
      marks.push({ name, durationMs, metadata });
      logDashboardPerf(
        `[dashboard-perf] ${label}-${name}-end request_id=${requestId} duration=${formatDurationMs(durationMs)}${metadata ? ` ${metadata}` : ""}`
      );
    }
  };

  const flush = (outcome: "ok" | "error") => {
    const totalMs = performance.now() - startedAt;
    const compactBreakdown = marks.map((mark) => `${mark.name}=${formatDurationMs(mark.durationMs)}`).join(" ");
    logDashboardPerf(
      `[dashboard-perf] ${label}-summary request_id=${requestId} outcome=${outcome} total=${formatDurationMs(totalMs)} ${compactBreakdown}`
    );
  };

  return { requestId, measureAsync, flush };
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

const getDashboardJobsDirect = cache(async (): Promise<DashboardJobsResponse> => {
  const trace = createDashboardPerfTrace("dashboard-rsc-jobs");
  const endTotal = createDashboardPerfTimer("jobs-direct-total", `request_id=${trace.requestId}`);
  const supabase = createSupabaseServer();
  try {
    const [authResult, schemaResult] = await Promise.all([
      trace.measureAsync("auth", async () => supabase.auth.getUser()),
      trace.measureAsync("schema-resolve", async () => resolveJobsSchemaForCandidates(supabase, DASHBOARD_JOBS_FIELD_CANDIDATES))
    ]);

    const user = authResult.data.user;
    if (!user) {
      throw new Error("กรุณาเข้าสู่ระบบก่อนใช้งาน dashboard");
    }

    let table = schemaResult.table;
    let availableColumns = schemaResult.availableColumns;

    if (!table) {
      throw new Error("ไม่พบตารางงานเอกสารที่รองรับในฐานข้อมูล");
    }

    const selectedColumns = DASHBOARD_JOBS_FIELD_CANDIDATES.filter(
      (column) => availableColumns.has(column) && column !== "user_id"
    );

    if (!selectedColumns.includes("id")) {
      throw new Error("ตารางงานเอกสารต้องมีคอลัมน์ id");
    }

    const runDashboardJobsQuery = async (options: {
      tableName: string;
      selectableColumns: readonly string[];
      withUserFilter: boolean;
    }): Promise<{ data: Record<string, unknown>[] | null; error: { message: string } | null }> => {
      let query = supabase.from(options.tableName).select(options.selectableColumns.join(","));
      const orderByColumn = options.selectableColumns.includes("created_at") ? "created_at" : "id";
      query = query.order(orderByColumn, { ascending: false }).limit(DASHBOARD_INITIAL_ACTIVE_JOBS_LIMIT + 1);
      if (options.withUserFilter) {
        query = query.eq("user_id", user.id);
      }
      const { data, error } = await query;
      return { data: ((data ?? []) as unknown) as Record<string, unknown>[], error: error ? { message: error.message } : null };
    };

    let currentTable = table;
    let jobsQueryResult = await trace.measureAsync(
      "jobs-query",
      () =>
        runDashboardJobsQuery({
          tableName: currentTable,
          selectableColumns: selectedColumns,
          withUserFilter: availableColumns.has("user_id")
        }),
      `table=${currentTable}`
    );

    if (jobsQueryResult.error && currentTable === DASHBOARD_FAST_TABLE) {
      const fallbackSchema = await trace.measureAsync("schema-resolve-fallback", async () =>
        resolveJobsSchemaForCandidates(supabase, DASHBOARD_JOBS_FIELD_CANDIDATES)
      );
      if (fallbackSchema.table) {
        currentTable = fallbackSchema.table;
        availableColumns = fallbackSchema.availableColumns;
        const fallbackSelectedColumns = DASHBOARD_JOBS_FIELD_CANDIDATES.filter(
          (column) => availableColumns.has(column) && column !== "user_id"
        );
        jobsQueryResult = await trace.measureAsync(
          "jobs-query-fallback",
          () =>
            runDashboardJobsQuery({
              tableName: currentTable,
              selectableColumns: fallbackSelectedColumns,
              withUserFilter: availableColumns.has("user_id")
            }),
          `table=${currentTable}`
        );
      }
    }

    if (jobsQueryResult.error) {
      throw new Error(`ไม่สามารถโหลดข้อมูลงานเอกสารได้: ${jobsQueryResult.error.message}`);
    }

    const rawJobs = await trace.measureAsync("transform-filter-active", async () =>
      (jobsQueryResult.data ?? []).filter((job) => !isCompletedStatus(job.status))
    );
    const jobs = await trace.measureAsync("transform-enrich-creator", async () => enrichJobsWithCreatorName(supabase, rawJobs));
    trace.flush("ok");

    return {
      jobs: jobs.slice(0, DASHBOARD_INITIAL_ACTIVE_JOBS_LIMIT) as JobRecord[],
      hasUserIdColumn: availableColumns.has("user_id"),
      currentUserId: user.id,
      isPartial: jobs.length > DASHBOARD_INITIAL_ACTIVE_JOBS_LIMIT
    };
  } catch (error) {
    trace.flush("error");
    throw error;
  } finally {
    endTotal();
  }
});

export const fetchDashboardJobsOnServer = async (section: string): Promise<DashboardJobsResponse> => {
  const endFetch = createDashboardPerfTimer("jobs-fetch", `section=${section} mode=${DASHBOARD_FETCH_MODE}`);
  try {
    return await getDashboardJobsDirect();
  } finally {
    endFetch();
  }
};
