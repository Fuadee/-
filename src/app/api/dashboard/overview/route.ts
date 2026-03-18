import { NextResponse } from "next/server";

import { JOB_TABLE_CANDIDATES, resolveJobsSchemaForCandidates } from "@/lib/jobs";
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
const DASHBOARD_STATIC_CANONICAL_OVERVIEW_COLUMNS = ["id", "created_at", "status", "user_id", "payload", "tax_id", "title"] as const;
const DASHBOARD_STATIC_COLUMNS_CACHE_TTL_MS = 30 * 60 * 1000;
const DASHBOARD_STATIC_PROBE_CACHE_TTL_MS = 5 * 60 * 1000;

const DASHBOARD_FALLBACK_TITLE = "(ไม่ระบุชื่องาน)";

const COMPLETED_STATUSES = ["completed", "ดำเนินการแล้วเสร็จ"] as const;
const PENDING_STATUSES = ["pending", "pending_review", "pending_approval", "review_pending", "awaiting_payment", "รอตรวจ", "รอตรวจสอบ", "รออนุมัติ", "รอเบิกจ่าย"] as const;
const APPROVED_STATUSES = ["approved", "อนุมัติ", "อนุมัติแล้ว"] as const;
const REJECTED_STATUSES = ["rejected", "needs_fix", "revision_requested", "ไม่อนุมัติ", "รอการแก้ไข", "รอแก้ไข"] as const;

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

type ResolveDashboardSchemaOptions = {
  staticShortCircuitEnabled: boolean;
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

const resolveTitleWithFallbackMetadata = (
  job: Record<string, unknown>
): { title: string; usedPayloadFallback: boolean; usedDefaultFallback: boolean } => {
  const directTitle = asNonEmptyString(job.title) ?? asNonEmptyString(job.case_title) ?? asNonEmptyString(job.name);
  if (directTitle) {
    return {
      title: directTitle,
      usedPayloadFallback: false,
      usedDefaultFallback: false
    };
  }

  const payload = parsePayload(job.payload);
  const payloadTitle =
    asNonEmptyString(payload?.title) ??
    asNonEmptyString(payload?.case_title) ??
    asNonEmptyString(payload?.name) ??
    asNonEmptyString(payload?.subject_detail);

  if (payloadTitle) {
    return {
      title: payloadTitle,
      usedPayloadFallback: true,
      usedDefaultFallback: false
    };
  }

  return {
    title: DASHBOARD_FALLBACK_TITLE,
    usedPayloadFallback: true,
    usedDefaultFallback: true
  };
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

type StaticColumnsSource = "cache" | "introspect" | "predeclared";

type StaticColumnsCache = {
  expiresAt: number;
  availableColumns: Set<string>;
  source: Exclude<StaticColumnsSource, "cache">;
};

type StaticProbeCache = {
  expiresAt: number;
  result: { canUse: boolean; reason: string };
};

let staticColumnsCache: StaticColumnsCache | null = null;
let staticProbeCache: StaticProbeCache | null = null;

const getMissingColumns = (availableColumns: Set<string>, requiredColumns: readonly string[]): string[] =>
  requiredColumns.filter((column) => !availableColumns.has(column));

const toSortedColumnList = (columns: Set<string>): string[] => [...columns].sort((a, b) => a.localeCompare(b));

const hasFreshStaticColumnsCache = (entry: StaticColumnsCache | null): entry is StaticColumnsCache =>
  Boolean(entry && entry.expiresAt > Date.now());
const hasFreshStaticProbeCache = (entry: StaticProbeCache | null): entry is StaticProbeCache =>
  Boolean(entry && entry.expiresAt > Date.now());

const formatDurationMs = (value: number): string => `${value.toFixed(3)}ms`;

const isStaticSchemaShortCircuitEnabled = (): boolean => {
  const rawValue = process.env.DASHBOARD_OVERVIEW_STATIC_SCHEMA_SHORT_CIRCUIT;
  if (rawValue === undefined) {
    return true;
  }
  return isEnabledEnvFlag(rawValue);
};

const canUsePredeclaredStaticColumns = async (
  supabase: ReturnType<typeof createSupabaseServer>,
  predeclaredColumns: Set<string>
): Promise<{ canUse: boolean; reason: string }> => {
  const missingMinimumColumns = getMissingColumns(predeclaredColumns, DASHBOARD_MINIMUM_QUERY_FIELD_CANDIDATES);
  if (missingMinimumColumns.length > 0) {
    return {
      canUse: false,
      reason: `minimum-columns-missing:${missingMinimumColumns.join(",")}`
    };
  }

  const { error } = await supabase
    .from(DASHBOARD_CANONICAL_TABLE)
    .select(DASHBOARD_MINIMUM_QUERY_FIELD_CANDIDATES.join(","), { head: true, count: "planned" })
    .limit(1);

  if (error) {
    const errorCode = typeof error.code === "string" ? error.code : "unknown";
    return {
      canUse: false,
      reason: `canonical-probe-failed:${errorCode}`
    };
  }

  return {
    canUse: true,
    reason: "canonical-probe-ok"
  };
};

const readCanonicalGeneratedDocsColumns = async (
  supabase: ReturnType<typeof createSupabaseServer>
): Promise<Set<string> | null> => {
  const { data, error } = await supabase
    .schema("information_schema")
    .from("columns")
    .select("column_name")
    .eq("table_schema", "public")
    .eq("table_name", DASHBOARD_CANONICAL_TABLE);

  if (error || !data) {
    return null;
  }

  const introspectedColumns = new Set(
    ((data ?? []) as { column_name: string | null }[])
      .map((row) => row.column_name)
      .filter((column): column is string => typeof column === "string")
  );

  if (introspectedColumns.size === 0) {
    return new Set();
  }

  return new Set(
    DASHBOARD_FIELD_CANDIDATES.filter((column) => introspectedColumns.has(column))
  );
};

const resolveStaticGeneratedDocsColumns = async (
  supabase: ReturnType<typeof createSupabaseServer>
): Promise<{ availableColumns: Set<string>; source: StaticColumnsSource; cacheHit: boolean }> => {
  if (hasFreshStaticColumnsCache(staticColumnsCache)) {
    return {
      availableColumns: new Set(staticColumnsCache.availableColumns),
      source: "cache",
      cacheHit: true
    };
  }

  const introspectedColumns = await readCanonicalGeneratedDocsColumns(supabase);
  if (introspectedColumns && introspectedColumns.size > 0) {
    staticColumnsCache = {
      expiresAt: Date.now() + DASHBOARD_STATIC_COLUMNS_CACHE_TTL_MS,
      availableColumns: new Set(introspectedColumns),
      source: "introspect"
    };
    return {
      availableColumns: new Set(introspectedColumns),
      source: "introspect",
      cacheHit: false
    };
  }

  const predeclaredColumns = new Set(DASHBOARD_STATIC_CANONICAL_OVERVIEW_COLUMNS);
  staticColumnsCache = {
    expiresAt: Date.now() + DASHBOARD_STATIC_COLUMNS_CACHE_TTL_MS,
    availableColumns: new Set(predeclaredColumns),
    source: "predeclared"
  };

  return {
    availableColumns: predeclaredColumns,
    source: "predeclared",
    cacheHit: false
  };
};

const resolveDashboardSchema = async (
  supabase: ReturnType<typeof createSupabaseServer>,
  options: ResolveDashboardSchemaOptions
): Promise<DashboardSchemaResolution> => {
  const schemaResolveStart = performance.now();
  const staticSchemaDecision = resolveStaticDashboardSchemaDecision();
  console.info("dashboard-overview-schema-resolve-start");

  if (staticSchemaDecision.enabled) {
    const predeclaredColumns = new Set(DASHBOARD_STATIC_CANONICAL_OVERVIEW_COLUMNS);
    if (options.staticShortCircuitEnabled) {
      const staticProbeStart = performance.now();
      let staticProbeResult: { canUse: boolean; reason: string };
      if (hasFreshStaticProbeCache(staticProbeCache)) {
        console.info("dashboard-overview-schema-static-probe-cache-hit");
        staticProbeResult = staticProbeCache.result;
        console.info(`dashboard-overview-schema-static-probe-skipped: cached-result (${staticProbeResult.reason})`);
      } else {
        console.info("dashboard-overview-schema-static-probe-cache-miss");
        staticProbeResult = await canUsePredeclaredStaticColumns(supabase, predeclaredColumns);
        staticProbeCache = {
          expiresAt: Date.now() + DASHBOARD_STATIC_PROBE_CACHE_TTL_MS,
          result: staticProbeResult
        };
      }
      console.info(`dashboard-overview-schema-static-probe-end: ${formatDurationMs(performance.now() - staticProbeStart)}`);

      if (staticProbeResult.canUse) {
        const missingMinimumColumns = getMissingColumns(predeclaredColumns, DASHBOARD_MINIMUM_QUERY_FIELD_CANDIDATES);
        const introspectedColumns = toSortedColumnList(predeclaredColumns);
        console.info("dashboard-overview-static-schema-short-circuit: enabled");
        console.info("dashboard-overview-schema-cache: skipped");
        console.info("dashboard-overview-schema-introspection-skipped: static-predeclared-sufficient");
        console.info(`dashboard-overview-schema-resolve-end: ${formatDurationMs(performance.now() - schemaResolveStart)}`);

        return {
          table: DASHBOARD_CANONICAL_TABLE,
          availableColumns: predeclaredColumns,
          introspectedColumns,
          missingMinimumColumns,
          schemaMode: "static",
          staticSchemaDecision
        };
      }

      console.info(`dashboard-overview-static-schema-short-circuit: disabled (reason=${staticProbeResult.reason})`);
      console.info(`dashboard-overview-schema-introspection-attempted: fallback-required (${staticProbeResult.reason})`);
    } else {
      console.info("dashboard-overview-static-schema-short-circuit: disabled (reason=flag-off)");
      console.info("dashboard-overview-schema-introspection-attempted: short-circuit-disabled");
    }

    const { availableColumns: canonicalColumns, source: staticColumnsSource, cacheHit } = await resolveStaticGeneratedDocsColumns(supabase);
    const missingMinimumColumns = getMissingColumns(canonicalColumns, DASHBOARD_MINIMUM_QUERY_FIELD_CANDIDATES);
    const introspectedColumns = toSortedColumnList(canonicalColumns);

    console.info(`dashboard-overview-schema-cache-${cacheHit ? "hit" : "miss"}`);
    console.info(`dashboard-overview-static-columns-source: ${staticColumnsSource}`);
    console.info("dashboard-overview-schema-introspection-attempted: true");

    if (canonicalColumns.size === 0) {
      const fallbackSchema = await resolveJobsSchemaForCandidates(supabase, DASHBOARD_FIELD_CANDIDATES);
      console.info("dashboard-overview-schema-fallback-reason: canonical-table-unavailable");
      console.info(`dashboard-overview-schema-resolve-end: ${formatDurationMs(performance.now() - schemaResolveStart)}`);
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
      console.info(`dashboard-overview-schema-fallback-reason: minimum-columns-missing (${missingMinimumColumns.join(",")})`);
      console.info(`dashboard-overview-schema-resolve-end: ${formatDurationMs(performance.now() - schemaResolveStart)}`);
      return {
        ...fallbackSchema,
        introspectedColumns,
        missingMinimumColumns,
        schemaMode: "dynamic-fallback",
        staticSchemaDecision,
        fallbackReason: "minimum columns missing"
      };
    }

    console.info(`dashboard-overview-schema-resolve-end: ${formatDurationMs(performance.now() - schemaResolveStart)}`);
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
  console.info("dashboard-overview-static-schema-short-circuit: disabled (reason=static-schema-disabled)");
  console.info("dashboard-overview-schema-introspection-skipped: static-schema-disabled");
  console.info("dashboard-overview-schema-fallback-reason: static-schema-disabled");
  console.info(`dashboard-overview-schema-resolve-end: ${formatDurationMs(performance.now() - schemaResolveStart)}`);
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
  const routeStart = performance.now();
  console.info("dashboard-overview-route-start");
  try {
    const supabase = createSupabaseServer();

    console.info("dashboard-overview-auth-user-start");
    const authStart = performance.now();
    let user: Awaited<ReturnType<typeof supabase.auth.getUser>>["data"]["user"];
    try {
      ({
        data: { user }
      } = await supabase.auth.getUser());
    } finally {
      console.info(`dashboard-overview-auth-user-end: ${formatDurationMs(performance.now() - authStart)}`);
    }

    if (!user) {
      return NextResponse.json({ message: "กรุณาเข้าสู่ระบบก่อนใช้งาน dashboard" }, { status: 401 });
    }

    console.info("dashboard-overview-schema-resolve-wrapper-start");
    const schemaResolveWrapperStart = performance.now();
    let table: string | null;
    let availableColumns: Set<string>;
    let introspectedColumns: string[];
    let missingMinimumColumns: string[];
    let schemaMode: DashboardSchemaResolution["schemaMode"];
    let staticSchemaDecision: DashboardSchemaResolution["staticSchemaDecision"];
    let fallbackReason: DashboardSchemaResolution["fallbackReason"];
    const staticShortCircuitEnabled = isStaticSchemaShortCircuitEnabled();
    try {
      ({ table, availableColumns, introspectedColumns, missingMinimumColumns, schemaMode, staticSchemaDecision, fallbackReason } = await resolveDashboardSchema(supabase, {
        staticShortCircuitEnabled
      }));
    } finally {
      console.info(`dashboard-overview-schema-resolve-wrapper-end: ${formatDurationMs(performance.now() - schemaResolveWrapperStart)}`);
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

    console.info("dashboard-overview-summary-query-start");
    const summaryStart = performance.now();
    let total = 0;
    let pending = 0;
    let approved = 0;
    let rejected = 0;
    let completed = 0;
    let summaryResolvedByRpc = false;
    try {
      if (hasStatusColumn) {
        const canUseSummaryRpc = table === DASHBOARD_CANONICAL_TABLE && hasUserIdColumn;
        if (canUseSummaryRpc) {
          console.info("dashboard-overview-summary-rpc-attempted");
          const { data: summaryRows, error: summaryRpcError } = await supabase.rpc("dashboard_overview_summary", {
            p_user_id: user.id
          });

          if (!summaryRpcError) {
            const row = Array.isArray(summaryRows) ? summaryRows[0] : null;
            total = Number(row?.total ?? 0);
            pending = Number(row?.pending ?? 0);
            approved = Number(row?.approved ?? 0);
            rejected = Number(row?.rejected ?? 0);
            completed = Number(row?.completed ?? 0);
            summaryResolvedByRpc = true;
            console.info("dashboard-overview-summary-rpc-used");
          } else {
            console.info(`dashboard-overview-summary-rpc-fallback: ${summaryRpcError.code ?? "unknown-error"}`);
          }
        }

        if (!summaryResolvedByRpc) {
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
          console.info("dashboard-overview-summary-rpc-skipped-or-fallback-to-count-queries");
        }
      } else {
        console.info("dashboard-overview-summary-status-column-missing: total-only");
        const { count: totalCount, error: totalError } = await buildCountQuery();
        if (totalError) {
          return NextResponse.json({ message: `ไม่สามารถโหลด summary ของ dashboard ได้: ${totalError.message}` }, { status: 500 });
        }
        total = totalCount ?? 0;
      }
    } finally {
      console.info(`dashboard-overview-summary-query-end: ${formatDurationMs(performance.now() - summaryStart)}`);
    }

    console.info("dashboard-overview-jobs-query-start");
    const jobsStart = performance.now();
    let jobs: Record<string, unknown>[] = [];
    try {
      if (availableColumns.has("payload")) {
        console.info("dashboard-overview-jobs-payload-column-retained: title-fallback-required");
      }
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

      let jobsUsingPayloadFallback = 0;
      let jobsUsingDefaultTitleFallback = 0;
      let jobsWithDirectTitle = 0;
      jobs = ((jobsData ?? []) as unknown as Record<string, unknown>[])
        .filter((job) => !isCompletedStatus(job.status))
        .map((job) => {
          const titleResolution = resolveTitleWithFallbackMetadata(job);
          if (titleResolution.usedPayloadFallback) {
            jobsUsingPayloadFallback += 1;
          } else {
            jobsWithDirectTitle += 1;
          }
          if (titleResolution.usedDefaultFallback) {
            jobsUsingDefaultTitleFallback += 1;
          }
          return {
            ...job,
            title: titleResolution.title
          };
        });
      const payloadRetentionReason =
        jobsUsingPayloadFallback > 0
          ? "payload-title-fallback-rows-present"
          : "no-payload-fallback-needed-but-retained-for-response-compat";
      console.info(
        `dashboard-overview-jobs-title-fallback-stats: total_rows=${jobs.length}; direct_title_rows=${jobsWithDirectTitle}; payload_fallback_rows=${jobsUsingPayloadFallback}; default_title_rows=${jobsUsingDefaultTitleFallback}`
      );
      if (availableColumns.has("payload")) {
        console.info(`dashboard-overview-jobs-payload-retention-reason: ${payloadRetentionReason}`);
      }
    } finally {
      console.info(`dashboard-overview-jobs-query-end: ${formatDurationMs(performance.now() - jobsStart)}`);
    }

    console.info("dashboard-overview-transform-start");
    const transformStart = performance.now();
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
      console.info(`dashboard-overview-transform-end: ${formatDurationMs(performance.now() - transformStart)}`);
    }
  } finally {
    console.info(`dashboard-overview-route-end: ${formatDurationMs(performance.now() - routeStart)}`);
  }
}
