import { cache } from "react";
import { unstable_cache } from "next/cache";

import { resolveJobsSchemaForCandidates, type JobRecord } from "@/lib/jobs";
import { createSupabaseServer } from "@/lib/supabase/server";

export type DashboardSummaryResponse = {
  summary: {
    activeCount: number;
    pendingReviewCount: number;
    precheckPendingCount: number;
    needsFixCount: number;
    completedCount: number;
  };
  hasUserIdColumn: boolean;
  currentUserId: string | null;
};

export type DashboardJobsResponse = {
  jobs: JobRecord[];
  hasUserIdColumn: boolean;
  currentUserId: string | null;
  isPartial: boolean;
};

const DASHBOARD_SUMMARY_FIELD_CANDIDATES = ["id", "created_at", "status", "user_id"] as const;
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
const DASHBOARD_SUMMARY_REVALIDATE_SECONDS = 10;
const DASHBOARD_INITIAL_ACTIVE_JOBS_LIMIT = 10;

const formatDurationMs = (value: number): string => `${value.toFixed(3)}ms`;
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

const getDashboardSummaryDirect = cache(async (): Promise<DashboardSummaryResponse> => {
  const supabase = createSupabaseServer();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("กรุณาเข้าสู่ระบบก่อนใช้งาน dashboard");
  }

  const loadSummary = unstable_cache(
    async (): Promise<DashboardSummaryResponse> => {
      const { table, availableColumns } = await resolveJobsSchemaForCandidates(supabase, DASHBOARD_SUMMARY_FIELD_CANDIDATES);

      if (!table) {
        throw new Error("ไม่พบตารางงานเอกสารที่รองรับในฐานข้อมูล");
      }

      const selectedColumns = DASHBOARD_SUMMARY_FIELD_CANDIDATES.filter((column) => availableColumns.has(column));

      if (!selectedColumns.includes("id")) {
        throw new Error("ตารางงานเอกสารต้องมีคอลัมน์ id");
      }

      let query = supabase.from(table).select(selectedColumns.join(","));
      const orderByColumn = availableColumns.has("created_at") ? "created_at" : "id";
      query = query.order(orderByColumn, { ascending: false }).limit(20);

      if (availableColumns.has("user_id")) {
        query = query.eq("user_id", user.id);
      }

      const { data, error } = await query;
      if (error) {
        throw new Error(`ไม่สามารถโหลดข้อมูลงานเอกสารได้: ${error.message}`);
      }

      const allJobs = (data ?? []) as unknown as Record<string, unknown>[];
      let activeCount = 0;
      let pendingReviewCount = 0;
      let precheckPendingCount = 0;
      let needsFixCount = 0;
      let completedCount = 0;

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

      return {
        summary: {
          activeCount,
          pendingReviewCount,
          precheckPendingCount,
          needsFixCount,
          completedCount
        },
        hasUserIdColumn: availableColumns.has("user_id"),
        currentUserId: user.id
      };
    },
    ["dashboard-summary", user.id],
    { revalidate: DASHBOARD_SUMMARY_REVALIDATE_SECONDS }
  );

  return loadSummary();
});

const getDashboardJobsDirect = cache(async (): Promise<DashboardJobsResponse> => {
  const supabase = createSupabaseServer();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("กรุณาเข้าสู่ระบบก่อนใช้งาน dashboard");
  }

  const { table, availableColumns } = await resolveJobsSchemaForCandidates(supabase, DASHBOARD_JOBS_FIELD_CANDIDATES);
  if (!table) {
    throw new Error("ไม่พบตารางงานเอกสารที่รองรับในฐานข้อมูล");
  }

  const selectedColumns = DASHBOARD_JOBS_FIELD_CANDIDATES.filter(
    (column) => availableColumns.has(column) && column !== "user_id"
  );

  if (!selectedColumns.includes("id")) {
    throw new Error("ตารางงานเอกสารต้องมีคอลัมน์ id");
  }

  let query = supabase.from(table).select(selectedColumns.join(","));
  const orderByColumn = availableColumns.has("created_at") ? "created_at" : "id";
  query = query.order(orderByColumn, { ascending: false }).limit(DASHBOARD_INITIAL_ACTIVE_JOBS_LIMIT + 1);

  if (availableColumns.has("user_id")) {
    query = query.eq("user_id", user.id);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`ไม่สามารถโหลดข้อมูลงานเอกสารได้: ${error.message}`);
  }

  const rawJobs = ((data ?? []) as unknown as Record<string, unknown>[]).filter((job) => !isCompletedStatus(job.status));
  const jobs = await enrichJobsWithCreatorName(supabase, rawJobs);

  return {
    jobs: jobs.slice(0, DASHBOARD_INITIAL_ACTIVE_JOBS_LIMIT) as JobRecord[],
    hasUserIdColumn: availableColumns.has("user_id"),
    currentUserId: user.id,
    isPartial: jobs.length > DASHBOARD_INITIAL_ACTIVE_JOBS_LIMIT
  };
});

export const fetchDashboardSummaryOnServer = async (section: string): Promise<DashboardSummaryResponse> => {
  const startedAt = performance.now();
  console.info(`[dashboard-rsc] summary-fetch-start section=${section} mode=${DASHBOARD_FETCH_MODE}`);
  try {
    return await getDashboardSummaryDirect();
  } finally {
    console.info(
      `[dashboard-rsc] summary-fetch-end section=${section} mode=${DASHBOARD_FETCH_MODE} duration=${formatDurationMs(performance.now() - startedAt)}`
    );
  }
};

export const fetchDashboardJobsOnServer = async (section: string): Promise<DashboardJobsResponse> => {
  const startedAt = performance.now();
  console.info(`[dashboard-rsc] jobs-fetch-start section=${section} mode=${DASHBOARD_FETCH_MODE}`);
  try {
    return await getDashboardJobsDirect();
  } finally {
    console.info(
      `[dashboard-rsc] jobs-fetch-end section=${section} mode=${DASHBOARD_FETCH_MODE} duration=${formatDurationMs(performance.now() - startedAt)}`
    );
  }
};
