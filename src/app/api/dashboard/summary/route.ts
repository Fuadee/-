import { NextResponse } from "next/server";

import { createSupabaseServer } from "@/lib/supabase/server";

const isCompletedStatus = (value: unknown): boolean => {
  if (typeof value !== "string") {
    return false;
  }

  const normalized = value.trim();
  return normalized === "completed" || normalized === "ดำเนินการแล้วเสร็จ";
};

const DASHBOARD_COLUMNS = [
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

const DASHBOARD_TABLE_FALLBACKS = ["generated_docs", "doc_jobs", "documents", "jobs"] as const;
const DASHBOARD_TABLE_ENV = process.env.DASHBOARD_SUMMARY_TABLE?.trim();
const DEFAULT_DASHBOARD_TABLE = DASHBOARD_TABLE_ENV || DASHBOARD_TABLE_FALLBACKS[0];

let cachedSummaryTable = DEFAULT_DASHBOARD_TABLE;
let cachedHasUserIdColumn = true;

const SELECT_WITH_USER_ID = DASHBOARD_COLUMNS.join(",");
const SELECT_WITHOUT_USER_ID = DASHBOARD_COLUMNS.filter((column) => column !== "user_id").join(",");

const isMissingUserIdColumnError = (error: { message?: string; code?: string } | null): boolean => {
  if (!error) {
    return false;
  }

  const message = (error.message ?? "").toLowerCase();
  return (
    error.code === "42703" ||
    (message.includes("column") && message.includes("user_id") && message.includes("does not exist"))
  );
};

const getTableCandidates = (): string[] => {
  const unique = new Set<string>([cachedSummaryTable, ...DASHBOARD_TABLE_FALLBACKS]);
  return Array.from(unique);
};

const fetchSummaryRows = async (
  supabase: ReturnType<typeof createSupabaseServer>,
  userId: string
): Promise<{
  data: Record<string, unknown>[];
  error: { message?: string; code?: string } | null;
  table: string;
  hasUserIdColumn: boolean;
}> => {
  const tableCandidates = getTableCandidates();

  for (const table of tableCandidates) {
    const selectColumns = cachedHasUserIdColumn ? SELECT_WITH_USER_ID : SELECT_WITHOUT_USER_ID;

    let query = supabase.from(table).select(selectColumns).order("created_at", { ascending: false }).limit(20);

    if (cachedHasUserIdColumn) {
      query = query.eq("user_id", userId);
    }

    const firstAttempt = await query;

    if (!firstAttempt.error) {
      cachedSummaryTable = table;
      return {
        data: (firstAttempt.data ?? []) as unknown as Record<string, unknown>[],
        error: null,
        table,
        hasUserIdColumn: cachedHasUserIdColumn
      };
    }

    if (cachedHasUserIdColumn && isMissingUserIdColumnError(firstAttempt.error)) {
      const fallbackAttempt = await supabase
        .from(table)
        .select(SELECT_WITHOUT_USER_ID)
        .order("created_at", { ascending: false })
        .limit(20);

      if (!fallbackAttempt.error) {
        cachedSummaryTable = table;
        cachedHasUserIdColumn = false;
        return {
          data: (fallbackAttempt.data ?? []) as unknown as Record<string, unknown>[],
          error: null,
          table,
          hasUserIdColumn: false
        };
      }

      return {
        data: [],
        error: fallbackAttempt.error,
        table,
        hasUserIdColumn: false
      };
    }

    if (table !== tableCandidates[tableCandidates.length - 1]) {
      continue;
    }

    return {
      data: [],
      error: firstAttempt.error,
      table,
      hasUserIdColumn: cachedHasUserIdColumn
    };
  }

  return {
    data: [],
    error: { message: "ไม่พบตารางงานเอกสารที่รองรับในฐานข้อมูล" },
    table: cachedSummaryTable,
    hasUserIdColumn: cachedHasUserIdColumn
  };
};

export async function GET() {
  console.time("dashboard-summary-route-total");
  const supabase = createSupabaseServer();
  console.time("dashboard-summary-auth-user");
  const {
    data: { user }
  } = await supabase.auth.getUser();
  console.timeEnd("dashboard-summary-auth-user");

  if (!user) {
    console.timeEnd("dashboard-summary-route-total");
    return NextResponse.json({ message: "กรุณาเข้าสู่ระบบก่อนใช้งาน dashboard" }, { status: 401 });
  }

  console.time("dashboard-summary-total");
  const { data, error, table, hasUserIdColumn } = await fetchSummaryRows(supabase, user.id);
  console.timeEnd("dashboard-summary-total");

  if (error) {
    console.timeEnd("dashboard-summary-route-total");
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

  console.timeEnd("dashboard-summary-route-total");

  return NextResponse.json({
    jobs,
    summary: {
      completedCount
    },
    table,
    hasUserIdColumn,
    currentUserId: user.id
  });
}
