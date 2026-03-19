import { cache } from "react";

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
};

const DASHBOARD_SUMMARY_FIELD_CANDIDATES = ["id", "created_at", "status", "user_id"] as const;
const DASHBOARD_JOBS_FIELD_CANDIDATES = ["id", "title", "case_title", "name", "created_at", "status", "tax_id", "payload", "user_id"] as const;
const DASHBOARD_FETCH_MODE = "direct-data-access";

const formatDurationMs = (value: number): string => `${value.toFixed(3)}ms`;
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
  query = query.order(orderByColumn, { ascending: false }).limit(20);

  if (availableColumns.has("user_id")) {
    query = query.eq("user_id", user.id);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`ไม่สามารถโหลดข้อมูลงานเอกสารได้: ${error.message}`);
  }

  const jobs = ((data ?? []) as unknown as Record<string, unknown>[]).filter((job) => !isCompletedStatus(job.status));
  return { jobs: jobs as JobRecord[] };
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
