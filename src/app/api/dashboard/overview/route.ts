import { NextResponse } from "next/server";

import { resolveJobsSchemaForCandidates } from "@/lib/jobs";
import { createSupabaseServer } from "@/lib/supabase/server";

const DASHBOARD_FIELD_CANDIDATES = ["id", "title", "case_title", "name", "created_at", "status", "tax_id", "payload", "user_id"] as const;
const DASHBOARD_CANONICAL_TABLE = "generated_docs";
const DASHBOARD_CANONICAL_COLUMNS = new Set<string>(DASHBOARD_FIELD_CANDIDATES);

const COMPLETED_STATUSES = ["completed", "ดำเนินการแล้วเสร็จ"] as const;
const PENDING_STATUSES = ["pending", "pending_review", "pending_approval", "awaiting_payment", "รอตรวจ", "รออนุมัติ", "รอเบิกจ่าย"] as const;
const APPROVED_STATUSES = ["approved", "อนุมัติ", "อนุมัติแล้ว"] as const;
const REJECTED_STATUSES = ["rejected", "needs_fix", "ไม่อนุมัติ", "รอการแก้ไข"] as const;

const isCompletedStatus = (value: unknown): boolean => {
  if (typeof value !== "string") {
    return false;
  }

  const normalized = value.trim();
  return normalized === "completed" || normalized === "ดำเนินการแล้วเสร็จ";
};

const shouldUseStaticDashboardSchema = (): boolean =>
  process.env.NODE_ENV === "production" && process.env.DASHBOARD_OVERVIEW_DYNAMIC_SCHEMA !== "true";

const resolveDashboardSchema = async (supabase: ReturnType<typeof createSupabaseServer>) => {
  if (shouldUseStaticDashboardSchema()) {
    return {
      table: DASHBOARD_CANONICAL_TABLE,
      availableColumns: new Set(DASHBOARD_CANONICAL_COLUMNS)
    };
  }

  return resolveJobsSchemaForCandidates(supabase, DASHBOARD_FIELD_CANDIDATES);
};

export async function GET() {
  console.time("dashboard-overview-route-total");
  try {
    const supabase = createSupabaseServer();

    console.time("dashboard-overview-auth-user");
    let user: Awaited<ReturnType<typeof supabase.auth.getUser>>["data"]["user"];
    try {
      ({
        data: { user }
      } = await supabase.auth.getUser());
    } finally {
      console.timeEnd("dashboard-overview-auth-user");
    }

    if (!user) {
      return NextResponse.json({ message: "กรุณาเข้าสู่ระบบก่อนใช้งาน dashboard" }, { status: 401 });
    }

    console.time("dashboard-overview-resolve-schema");
    let table: string | null;
    let availableColumns: Set<string>;
    try {
      ({ table, availableColumns } = await resolveDashboardSchema(supabase));
    } finally {
      console.timeEnd("dashboard-overview-resolve-schema");
    }

    if (!table) {
      return NextResponse.json({ message: "ไม่พบตารางงานเอกสารที่รองรับในฐานข้อมูล" }, { status: 500 });
    }

    const hasUserIdColumn = availableColumns.has("user_id");
    const hasStatusColumn = availableColumns.has("status");

    const selectedColumns = DASHBOARD_FIELD_CANDIDATES.filter((column) => availableColumns.has(column) && column !== "user_id");
    if (!selectedColumns.includes("id")) {
      return NextResponse.json({ message: "ตารางงานเอกสารต้องมีคอลัมน์ id" }, { status: 500 });
    }

    const buildCountQuery = () => {
      let query = supabase.from(table).select("id", { head: true, count: "exact" });
      if (hasUserIdColumn) {
        query = query.eq("user_id", user.id);
      }
      return query;
    };

    console.time("dashboard-overview-summary-query");
    let total = 0;
    let pending = 0;
    let approved = 0;
    let rejected = 0;
    let completed = 0;
    try {
      if (hasStatusColumn) {
        const [totalResult, pendingResult, approvedResult, rejectedResult, completedResult] = await Promise.all([
          buildCountQuery(),
          buildCountQuery().in("status", [...PENDING_STATUSES]),
          buildCountQuery().in("status", [...APPROVED_STATUSES]),
          buildCountQuery().in("status", [...REJECTED_STATUSES]),
          buildCountQuery().in("status", [...COMPLETED_STATUSES])
        ]);

        const summaryError =
          totalResult.error ?? pendingResult.error ?? approvedResult.error ?? rejectedResult.error ?? completedResult.error;
        if (summaryError) {
          return NextResponse.json({ message: `ไม่สามารถโหลด summary ของ dashboard ได้: ${summaryError.message}` }, { status: 500 });
        }

        total = totalResult.count ?? 0;
        pending = pendingResult.count ?? 0;
        approved = approvedResult.count ?? 0;
        rejected = rejectedResult.count ?? 0;
        completed = completedResult.count ?? 0;
      } else {
        const { count: totalCount, error: totalError } = await buildCountQuery();
        if (totalError) {
          return NextResponse.json({ message: `ไม่สามารถโหลด summary ของ dashboard ได้: ${totalError.message}` }, { status: 500 });
        }
        total = totalCount ?? 0;
      }
    } finally {
      console.timeEnd("dashboard-overview-summary-query");
    }

    console.time("dashboard-overview-jobs-query");
    let jobs: Record<string, unknown>[] = [];
    try {
      let jobsQuery = supabase.from(table).select(selectedColumns.join(","));

      const orderByColumn = availableColumns.has("created_at") ? "created_at" : "id";
      jobsQuery = jobsQuery.order(orderByColumn, { ascending: false }).limit(20);

      if (hasUserIdColumn) {
        jobsQuery = jobsQuery.eq("user_id", user.id);
      }

      const { data: jobsData, error: jobsError } = await jobsQuery;
      if (jobsError) {
        return NextResponse.json({ message: `ไม่สามารถโหลดข้อมูลงานเอกสารได้: ${jobsError.message}` }, { status: 500 });
      }

      jobs = ((jobsData ?? []) as unknown as Record<string, unknown>[]).filter((job) => !isCompletedStatus(job.status));
    } finally {
      console.timeEnd("dashboard-overview-jobs-query");
    }

    console.time("dashboard-overview-transform");
    try {
      return NextResponse.json({
        summary: {
          total,
          pending,
          approved,
          rejected,
          completed
        },
        jobs,
        hasUserIdColumn,
        currentUserId: user.id
      });
    } finally {
      console.timeEnd("dashboard-overview-transform");
    }
  } finally {
    console.timeEnd("dashboard-overview-route-total");
  }
}
