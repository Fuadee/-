import { NextResponse } from "next/server";

import { resolveAvailableColumns, resolveJobsTable } from "@/lib/jobs";
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

    const availableColumns = await resolveAvailableColumns(supabase, table);
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
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: "กรุณาเข้าสู่ระบบก่อนใช้งาน dashboard" }, { status: 401 });
  }

  const { table, availableColumns } = await resolveDashboardSchema(supabase);

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

  const { data, error } = await query;

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

  console.log("[dashboard-summary] total records:", allJobs.length);
  console.log("[dashboard-summary] completed records:", completedCount);
  console.log("[dashboard-summary] pending records:", jobs.length);

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
