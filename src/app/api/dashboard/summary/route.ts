import { NextResponse } from "next/server";

import { resolveAvailableColumnsForCandidates, resolveJobsTable } from "@/lib/jobs";
import { createSupabaseServer } from "@/lib/supabase/server";

const SCHEMA_CACHE_TTL_MS = 5 * 60 * 1000;

type DashboardSchemaResolution = {
  table: string | null;
  availableColumns: Set<string>;
};

let dashboardSchemaCache:
  | {
      expiresAt: number;
      value?: DashboardSchemaResolution;
      promise?: Promise<DashboardSchemaResolution>;
    }
  | null = null;

const cloneResolution = (resolution: DashboardSchemaResolution): DashboardSchemaResolution => ({
  table: resolution.table,
  availableColumns: new Set(resolution.availableColumns)
});

const resolveDashboardSchema = async (
  supabase: ReturnType<typeof createSupabaseServer>
): Promise<DashboardSchemaResolution> => {
  const now = Date.now();

  if (dashboardSchemaCache?.value && dashboardSchemaCache.expiresAt > now) {
    return cloneResolution(dashboardSchemaCache.value);
  }

  if (dashboardSchemaCache?.promise) {
    return cloneResolution(await dashboardSchemaCache.promise);
  }

  const resolutionPromise = (async (): Promise<DashboardSchemaResolution> => {
    const table = await resolveJobsTable(supabase);

    if (!table) {
      return { table: null, availableColumns: new Set() };
    }

    const availableColumns = await resolveAvailableColumnsForCandidates(
      supabase,
      table,
      DASHBOARD_FIELD_CANDIDATES
    );
    return { table, availableColumns };
  })();

  dashboardSchemaCache = {
    expiresAt: now + SCHEMA_CACHE_TTL_MS,
    promise: resolutionPromise
  };

  try {
    const value = await resolutionPromise;
    dashboardSchemaCache = {
      expiresAt: Date.now() + SCHEMA_CACHE_TTL_MS,
      value
    };

    return cloneResolution(value);
  } catch (error) {
    dashboardSchemaCache = null;
    throw error;
  }
};

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
    let table: DashboardSchemaResolution["table"];
    let availableColumns: DashboardSchemaResolution["availableColumns"];
    try {
      ({ table, availableColumns } = await resolveDashboardSchema(supabase));
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
      if (normalizedStatus === "pending_review") {
        pendingReviewCount += 1;
      }
      if (normalizedStatus === "needs_fix") {
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
