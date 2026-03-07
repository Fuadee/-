import { NextResponse } from "next/server";

import { JOB_TABLE_CANDIDATES, resolveAvailableColumnsForCandidates, resolveJobsSchemaForCandidates } from "@/lib/jobs";
import { createSupabaseServer } from "@/lib/supabase/server";

const DASHBOARD_MINIMUM_QUERY_FIELD_CANDIDATES = ["id"] as const;
const DASHBOARD_CORE_QUERY_FIELD_CANDIDATES = ["id", "created_at", "status", "user_id"] as const;
const DASHBOARD_OPTIONAL_FIELD_CANDIDATES = ["tax_id", "payload"] as const;
const DASHBOARD_OPTIONAL_TITLE_FIELD_CANDIDATES = ["title", "case_title", "name"] as const;
const DASHBOARD_FIELD_CANDIDATES = [
  ...DASHBOARD_CORE_QUERY_FIELD_CANDIDATES,
  ...DASHBOARD_OPTIONAL_FIELD_CANDIDATES,
  ...DASHBOARD_OPTIONAL_TITLE_FIELD_CANDIDATES
] as const;
const DASHBOARD_CANONICAL_TABLE = "generated_docs";

const DASHBOARD_FALLBACK_TITLE = "(ไม่ระบุชื่องาน)";

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

const isEnabledEnvFlag = (value: string | undefined): boolean => value?.toLowerCase() === "true";

type StaticSchemaDecision = {
  enabled: boolean;
  reason: string;
};

const resolveStaticDashboardSchemaDecision = (): StaticSchemaDecision => {
  const forceStaticSchema = isEnabledEnvFlag(process.env.DASHBOARD_OVERVIEW_FORCE_STATIC);
  const forceDynamicSchema = isEnabledEnvFlag(process.env.DASHBOARD_OVERVIEW_DYNAMIC_SCHEMA);

  if (forceStaticSchema && forceDynamicSchema) {
    return {
      enabled: true,
      reason: "DASHBOARD_OVERVIEW_FORCE_STATIC=true overrides DASHBOARD_OVERVIEW_DYNAMIC_SCHEMA=true"
    };
  }

  if (forceStaticSchema) {
    return {
      enabled: true,
      reason: "DASHBOARD_OVERVIEW_FORCE_STATIC=true"
    };
  }

  if (forceDynamicSchema) {
    return {
      enabled: false,
      reason: "DASHBOARD_OVERVIEW_DYNAMIC_SCHEMA=true"
    };
  }

  return {
    enabled: true,
    reason: "default static enabled; fallback to dynamic only when canonical table is unavailable or minimum columns are missing"
  };
};

const parsePayload = (value: unknown): Record<string, unknown> | null => {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }

  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
};

const asNonEmptyString = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const resolveTitleWithFallback = (job: Record<string, unknown>): string => {
  const directTitle = asNonEmptyString(job.title) ?? asNonEmptyString(job.case_title) ?? asNonEmptyString(job.name);
  if (directTitle) {
    return directTitle;
  }

  const payload = parsePayload(job.payload);
  const payloadTitle =
    asNonEmptyString(payload?.title) ??
    asNonEmptyString(payload?.case_title) ??
    asNonEmptyString(payload?.name) ??
    asNonEmptyString(payload?.subject_detail);

  return payloadTitle ?? DASHBOARD_FALLBACK_TITLE;
};

type DashboardSchemaResolution = {
  table: string | null;
  availableColumns: Set<string>;
  introspectedColumns: string[];
  missingMinimumColumns: string[];
  schemaMode: "static" | "dynamic-fallback";
  staticSchemaDecision: StaticSchemaDecision;
  fallbackReason?: "canonical table unavailable" | "minimum columns missing" | "no usable overview columns" | "static schema disabled";
};

const getMissingColumns = (availableColumns: Set<string>, requiredColumns: readonly string[]): string[] =>
  requiredColumns.filter((column) => !availableColumns.has(column));

const toSortedColumnList = (columns: Set<string>): string[] => [...columns].sort((a, b) => a.localeCompare(b));

const resolveDashboardSchema = async (supabase: ReturnType<typeof createSupabaseServer>): Promise<DashboardSchemaResolution> => {
  const staticSchemaDecision = resolveStaticDashboardSchemaDecision();

  if (staticSchemaDecision.enabled) {
    const canonicalColumns = await resolveAvailableColumnsForCandidates(supabase, DASHBOARD_CANONICAL_TABLE, DASHBOARD_FIELD_CANDIDATES);
    const missingMinimumColumns = getMissingColumns(canonicalColumns, DASHBOARD_MINIMUM_QUERY_FIELD_CANDIDATES);
    const introspectedColumns = toSortedColumnList(canonicalColumns);

    if (canonicalColumns.size === 0) {
      const fallbackSchema = await resolveJobsSchemaForCandidates(supabase, DASHBOARD_FIELD_CANDIDATES);
      return {
        ...fallbackSchema,
        introspectedColumns,
        missingMinimumColumns,
        schemaMode: "dynamic-fallback",
        staticSchemaDecision,
        fallbackReason: "canonical table unavailable"
      };
    }

    if (missingMinimumColumns.length > 0) {
      const fallbackSchema = await resolveJobsSchemaForCandidates(supabase, DASHBOARD_FIELD_CANDIDATES);
      return {
        ...fallbackSchema,
        introspectedColumns,
        missingMinimumColumns,
        schemaMode: "dynamic-fallback",
        staticSchemaDecision,
        fallbackReason: "minimum columns missing"
      };
    }

    return {
      table: DASHBOARD_CANONICAL_TABLE,
      availableColumns: canonicalColumns,
      introspectedColumns,
      missingMinimumColumns,
      schemaMode: "static",
      staticSchemaDecision
    };
  }

  const fallbackSchema = await resolveJobsSchemaForCandidates(supabase, DASHBOARD_FIELD_CANDIDATES);
  return {
    ...fallbackSchema,
    introspectedColumns: toSortedColumnList(fallbackSchema.availableColumns),
    missingMinimumColumns: getMissingColumns(fallbackSchema.availableColumns, DASHBOARD_MINIMUM_QUERY_FIELD_CANDIDATES),
    schemaMode: "dynamic-fallback",
    staticSchemaDecision,
    fallbackReason: "static schema disabled"
  };
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
    let introspectedColumns: string[];
    let missingMinimumColumns: string[];
    let schemaMode: DashboardSchemaResolution["schemaMode"];
    let staticSchemaDecision: DashboardSchemaResolution["staticSchemaDecision"];
    let fallbackReason: DashboardSchemaResolution["fallbackReason"];
    try {
      ({ table, availableColumns, introspectedColumns, missingMinimumColumns, schemaMode, staticSchemaDecision, fallbackReason } = await resolveDashboardSchema(supabase));
    } finally {
      console.timeEnd("dashboard-overview-resolve-schema");
    }

    console.info(
      `dashboard-overview-static-schema: ${staticSchemaDecision.enabled ? "enabled" : "disabled"} (reason=${staticSchemaDecision.reason}; force_static=${process.env.DASHBOARD_OVERVIEW_FORCE_STATIC ?? "unset"}; dynamic_schema=${process.env.DASHBOARD_OVERVIEW_DYNAMIC_SCHEMA ?? "unset"}; node_env=${process.env.NODE_ENV ?? "unset"})`
    );

    const conciseColumns = introspectedColumns.join(",");
    const missingMinimumColumnsLabel = missingMinimumColumns.join(",") || "none";

    if (schemaMode === "static") {
      console.info(
        `dashboard-overview-schema-mode: static (table=${DASHBOARD_CANONICAL_TABLE}; columns=${conciseColumns || "none"}; required=${DASHBOARD_MINIMUM_QUERY_FIELD_CANDIDATES.join(",")}; missing_required=${missingMinimumColumnsLabel})`
      );
    } else {
      const resolvedFallbackReason = fallbackReason ?? (table ? "minimum columns missing" : "no usable overview columns");
      const resolvedTable = table ?? JOB_TABLE_CANDIDATES.join("|");
      console.info(
        `dashboard-overview-schema-mode: dynamic-fallback (reason=${resolvedFallbackReason}; table=${resolvedTable}; columns=${conciseColumns || "none"}; required=${DASHBOARD_MINIMUM_QUERY_FIELD_CANDIDATES.join(",")}; missing_required=${missingMinimumColumnsLabel})`
      );
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

      jobs = ((jobsData ?? []) as unknown as Record<string, unknown>[])
        .filter((job) => !isCompletedStatus(job.status))
        .map((job) => ({
          ...job,
          title: resolveTitleWithFallback(job)
        }));
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
