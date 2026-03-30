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
const DASHBOARD_SCHEMA_CACHE_TTL_MS = 30 * 60 * 1000;
const DASHBOARD_ENABLE_FAST_PATH = process.env.DASHBOARD_JOBS_ENABLE_FAST_PATH === "1";
const DASHBOARD_FAST_PATH_COLUMNS = [
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

const formatDurationMs = (value: number): string => `${value.toFixed(3)}ms`;
const logDashboardPerf = (messageFactory: string | (() => string)): void => {
  if (!isDashboardPerfLogEnabled) {
    return;
  }

  console.info(typeof messageFactory === "function" ? messageFactory() : messageFactory);
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

type DashboardTitleSource = "title" | "case_title" | "name" | "payload" | "none";

const createDashboardPerfTrace = (label: string): {
  requestId: string;
  measureAsync: <T>(name: string, fn: () => Promise<T>, metadata?: string) => Promise<T>;
  flush: (
    outcome: "ok" | "error",
    context: {
      fastPathUsed: boolean;
      fallbackUsed: boolean;
      queryCount: number;
      selectedPath: "fast" | "dynamic";
      selectedTitleSource: DashboardTitleSource;
      schemaSafe: boolean;
    }
  ) => void;
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

  const flush = (
    outcome: "ok" | "error",
    context: {
      fastPathUsed: boolean;
      fallbackUsed: boolean;
      queryCount: number;
      selectedPath: "fast" | "dynamic";
      selectedTitleSource: DashboardTitleSource;
      schemaSafe: boolean;
    }
  ) => {
    const totalMs = performance.now() - startedAt;
    const compactBreakdown = marks.map((mark) => `${mark.name}=${formatDurationMs(mark.durationMs)}`).join(" ");
    logDashboardPerf(
      `[dashboard-perf] ${label}-summary request_id=${requestId} outcome=${outcome} total=${formatDurationMs(totalMs)} fast-path-used=${
        context.fastPathUsed
      } fallback-used=${context.fallbackUsed} selected-path=${context.selectedPath} selected-title-source=${
        context.selectedTitleSource
      } schema-safe=${context.schemaSafe} query-count-per-request=${context.queryCount} ${compactBreakdown}`
    );
  };

  return { requestId, measureAsync, flush };
};

type DashboardQueryPlan =
  | {
      mode: "fast";
      table: string;
      selectableColumns: readonly string[];
      hasUserIdColumn: boolean;
      titleSource: DashboardTitleSource;
      schemaSafe: boolean;
    }
  | {
      mode: "dynamic";
      table: string;
      selectableColumns: readonly string[];
      hasUserIdColumn: boolean;
      titleSource: DashboardTitleSource;
      schemaSafe: boolean;
    };

type CachedPlan = {
  expiresAt: number;
  plan: DashboardQueryPlan;
};

let dashboardPlanCache: CachedPlan | null = null;

const hasFreshPlan = (entry: CachedPlan | null): entry is CachedPlan => Boolean(entry && entry.expiresAt > Date.now());

const resolveTitleSourceFromColumns = (columns: Set<string>): DashboardTitleSource => {
  if (columns.has("title")) return "title";
  if (columns.has("case_title")) return "case_title";
  if (columns.has("name")) return "name";
  if (columns.has("payload")) return "payload";
  return "none";
};

const resolveDashboardQueryPlan = async (
  supabase: ReturnType<typeof createSupabaseServer>,
  trace: ReturnType<typeof createDashboardPerfTrace>
): Promise<DashboardQueryPlan> => {
  if (hasFreshPlan(dashboardPlanCache)) {
    return dashboardPlanCache.plan;
  }

  const schemaResult = await trace.measureAsync("schema-resolve", async () => resolveJobsSchemaForCandidates(supabase, DASHBOARD_JOBS_FIELD_CANDIDATES));
  if (!schemaResult.table) {
    throw new Error("ไม่พบตารางงานเอกสารที่รองรับในฐานข้อมูล");
  }

  const schemaSafeColumns = new Set(schemaResult.availableColumns);
  const dynamicColumns = DASHBOARD_JOBS_FIELD_CANDIDATES.filter((column) => schemaSafeColumns.has(column) && column !== "user_id");
  if (!dynamicColumns.includes("id")) {
    throw new Error("ตารางงานเอกสารต้องมีคอลัมน์ id");
  }

  const titleSource = resolveTitleSourceFromColumns(schemaSafeColumns);
  const canUseFastPath =
    DASHBOARD_ENABLE_FAST_PATH &&
    schemaResult.table === DASHBOARD_FAST_TABLE &&
    DASHBOARD_FAST_PATH_COLUMNS.filter((column) => column !== "user_id").every((column) => schemaSafeColumns.has(column));

  const plan: DashboardQueryPlan = canUseFastPath
    ? {
        mode: "fast",
        table: DASHBOARD_FAST_TABLE,
        selectableColumns: DASHBOARD_FAST_PATH_COLUMNS.filter((column) => column !== "user_id"),
        hasUserIdColumn: schemaSafeColumns.has("user_id"),
        titleSource,
        schemaSafe: true
      }
    : {
        mode: "dynamic",
        table: schemaResult.table,
        selectableColumns: dynamicColumns,
        hasUserIdColumn: schemaSafeColumns.has("user_id"),
        titleSource,
        schemaSafe: true
      };
  dashboardPlanCache = {
    expiresAt: Date.now() + DASHBOARD_SCHEMA_CACHE_TTL_MS,
    plan
  };
  return plan;
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
  let fastPathUsed = false;
  let fallbackUsed = false;
  let queryCount = 0;
  let selectedPath: "fast" | "dynamic" = "dynamic";
  let selectedTitleSource: DashboardTitleSource = "none";
  let schemaSafe = false;
  try {
    const authResult = await trace.measureAsync("auth", async () => supabase.auth.getUser());

    const user = authResult.data.user;
    if (!user) {
      throw new Error("กรุณาเข้าสู่ระบบก่อนใช้งาน dashboard");
    }

    const runDashboardJobsQuery = async (options: {
      tableName: string;
      selectableColumns: readonly string[];
      withUserFilter: boolean;
    }): Promise<{ data: Record<string, unknown>[] | null; error: { code?: string; message: string } | null }> => {
      let query = supabase.from(options.tableName).select(options.selectableColumns.join(","));
      const orderByColumn = options.selectableColumns.includes("created_at") ? "created_at" : "id";
      query = query.order(orderByColumn, { ascending: false }).limit(DASHBOARD_INITIAL_ACTIVE_JOBS_LIMIT + 1);
      if (options.withUserFilter) {
        query = query.eq("user_id", user.id);
      }
      const { data, error } = await query;
      return {
        data: ((data ?? []) as unknown) as Record<string, unknown>[],
        error: error ? { code: typeof error.code === "string" ? error.code : undefined, message: error.message } : null
      };
    };

    const queryPlan = await trace.measureAsync("path-decision", async () => resolveDashboardQueryPlan(supabase, trace));
    fastPathUsed = queryPlan.mode === "fast";
    fallbackUsed = queryPlan.mode === "dynamic";
    selectedPath = queryPlan.mode;
    selectedTitleSource = queryPlan.titleSource;
    schemaSafe = queryPlan.schemaSafe;
    const jobsQueryStepName = queryPlan.mode === "fast" ? "jobs-query-fast-path" : "jobs-query-dynamic";
    const jobsQueryResult = await trace.measureAsync(
      jobsQueryStepName,
      async () => {
        queryCount += 1;
        return runDashboardJobsQuery({
          tableName: queryPlan.table,
          selectableColumns: queryPlan.selectableColumns,
          withUserFilter: queryPlan.hasUserIdColumn
        });
      },
      `table=${queryPlan.table}`
    );

    if (jobsQueryResult.error) {
      throw new Error(`ไม่สามารถโหลดข้อมูลงานเอกสารได้: ${jobsQueryResult.error.message}`);
    }

    const jobs = await trace.measureAsync("transform-filter-active", async () =>
      (jobsQueryResult.data ?? []).filter((job) => !isCompletedStatus(job.status))
    );
    trace.flush("ok", { fastPathUsed, fallbackUsed, queryCount, selectedPath, selectedTitleSource, schemaSafe });

    return {
      jobs: jobs.slice(0, DASHBOARD_INITIAL_ACTIVE_JOBS_LIMIT) as JobRecord[],
      hasUserIdColumn: queryPlan.hasUserIdColumn,
      currentUserId: user.id,
      isPartial: jobs.length > DASHBOARD_INITIAL_ACTIVE_JOBS_LIMIT
    };
  } catch (error) {
    trace.flush("error", { fastPathUsed, fallbackUsed, queryCount, selectedPath, selectedTitleSource, schemaSafe });
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
