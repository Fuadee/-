import type { SupabaseClient } from "@supabase/supabase-js";

export const JOB_TABLE_CANDIDATES = ["generated_docs", "doc_jobs", "documents", "jobs"] as const;

const COLUMN_PROBE_CANDIDATES = [
  "id",
  "user_id",
  "title",
  "case_title",
  "name",
  "department",
  "subject",
  "receipt_date",
  "tax_id",
  "created_at",
  "status",
  "doc_url",
  "file_url",
  "storage_path",
  "payload",
  "paid_at",
  "finished_at",
  "revision_note",
  "revision_requested_at",
  "revision_requested_by",
  "assignee_id",
  "assignee_name",
  "updated_at"
] as const;

type InformationSchemaColumnRow = {
  table_name?: string | null;
  column_name: string | null;
};

type InformationSchemaTableRow = {
  table_name: string | null;
};

const SCHEMA_CACHE_TTL_MS = 30 * 60 * 1000;

type CachedValue<T> = {
  expiresAt: number;
  value?: T;
  promise?: Promise<T>;
};

let jobsTableCache: CachedValue<string | null> | null = null;
const columnsByTableCache = new Map<string, CachedValue<Set<string> | null>>();
const columnsByCandidateCache = new Map<string, CachedValue<Set<string>>>();
let schemaWarmupCache: CachedValue<boolean> | null = null;

const hasFreshValue = <T>(entry: CachedValue<T> | null | undefined): entry is CachedValue<T> & { value: T } =>
  Boolean(entry?.value !== undefined && entry.expiresAt > Date.now());

const makeCandidateCacheKey = (table: string, candidates: readonly string[]): string => {
  const normalizedCandidates = [...new Set(candidates)].sort();
  return `${table}::${normalizedCandidates.join("|")}`;
};

const cacheValueWithTtl = <T>(value: T): CachedValue<T> => ({
  expiresAt: Date.now() + SCHEMA_CACHE_TTL_MS,
  value
});

async function warmSchemaCaches(supabase: SupabaseClient): Promise<boolean> {
  if (hasFreshValue(schemaWarmupCache)) {
    return schemaWarmupCache.value;
  }

  if (schemaWarmupCache?.promise) {
    return schemaWarmupCache.promise;
  }

  const resolutionPromise = (async () => {
    const { data, error } = await supabase
      .schema("information_schema")
      .from("columns")
      .select("table_name,column_name")
      .eq("table_schema", "public")
      .in("table_name", [...JOB_TABLE_CANDIDATES]);

    if (error || !data) {
      return false;
    }

    const columnsByTable = new Map<string, Set<string>>();

    for (const row of data as InformationSchemaColumnRow[]) {
      if (typeof row.table_name !== "string" || typeof row.column_name !== "string") {
        continue;
      }

      if (!columnsByTable.has(row.table_name)) {
        columnsByTable.set(row.table_name, new Set());
      }

      columnsByTable.get(row.table_name)?.add(row.column_name);
    }

    for (const table of JOB_TABLE_CANDIDATES) {
      if (columnsByTable.has(table)) {
        columnsByTableCache.set(table, cacheValueWithTtl(new Set(columnsByTable.get(table))));
      }
    }

    let resolvedTable: string | null = null;
    for (const table of JOB_TABLE_CANDIDATES) {
      if (columnsByTable.has(table)) {
        resolvedTable = table;
        break;
      }
    }

    jobsTableCache = cacheValueWithTtl(resolvedTable);
    return true;
  })();

  schemaWarmupCache = {
    expiresAt: Date.now() + SCHEMA_CACHE_TTL_MS,
    promise: resolutionPromise
  };

  try {
    const value = await resolutionPromise;
    schemaWarmupCache = cacheValueWithTtl(value);
    return value;
  } catch (error) {
    schemaWarmupCache = null;
    throw error;
  }
}


export type JobRecord = Record<string, unknown> & {
  revision_note?: string | null;
  revision_requested_at?: string | null;
  revision_requested_by?: string | null;
  assignee_id?: string | null;
  assignee_name?: string | null;
};

export async function resolveJobsTable(supabase: SupabaseClient): Promise<string | null> {
  if (hasFreshValue(jobsTableCache)) {
    return jobsTableCache.value;
  }

  await warmSchemaCaches(supabase);
  if (hasFreshValue(jobsTableCache)) {
    return jobsTableCache.value;
  }

  if (jobsTableCache?.promise) {
    return jobsTableCache.promise;
  }

  const resolutionPromise = (async (): Promise<string | null> => {
    const { data, error } = await supabase
      .schema("information_schema")
      .from("tables")
      .select("table_name")
      .eq("table_schema", "public")
      .in("table_name", [...JOB_TABLE_CANDIDATES]);

    if (!error && data) {
      const existingTables = new Set(
        (data as InformationSchemaTableRow[])
          .map((row) => row.table_name)
          .filter((table): table is string => typeof table === "string")
      );

      for (const table of JOB_TABLE_CANDIDATES) {
        if (existingTables.has(table)) {
          return table;
        }
      }

      return null;
    }

  const availability = await Promise.all(
    JOB_TABLE_CANDIDATES.map(async (table) => {
      const { error } = await supabase.from(table).select("id", { head: true, count: "planned" }).limit(1);
      return { table, exists: !error };
    })
  );

  for (const table of JOB_TABLE_CANDIDATES) {
    if (availability.find((entry) => entry.table === table)?.exists) {
      return table;
    }
  }

  return null;
  })();

  jobsTableCache = {
    expiresAt: Date.now() + SCHEMA_CACHE_TTL_MS,
    promise: resolutionPromise
  };

  try {
    const value = await resolutionPromise;
    jobsTableCache = {
      expiresAt: Date.now() + SCHEMA_CACHE_TTL_MS,
      value
    };
    return value;
  } catch (error) {
    jobsTableCache = null;
    throw error;
  }
}

async function introspectColumns(supabase: SupabaseClient, table: string): Promise<Set<string> | null> {
  const { data, error } = await supabase
    .schema("information_schema")
    .from("columns")
    .select("column_name")
    .eq("table_schema", "public")
    .eq("table_name", table);

  if (error || !data) {
    return null;
  }

  return new Set(
    (data as InformationSchemaColumnRow[])
      .map((row) => row.column_name)
      .filter((column): column is string => typeof column === "string")
  );
}

async function resolveColumnsForTable(supabase: SupabaseClient, table: string): Promise<Set<string> | null> {
  const cacheEntry = columnsByTableCache.get(table);

  if (hasFreshValue(cacheEntry)) {
    return cacheEntry.value ? new Set(cacheEntry.value) : null;
  }

  if (cacheEntry?.promise) {
    const pendingValue = await cacheEntry.promise;
    return pendingValue ? new Set(pendingValue) : null;
  }

  await warmSchemaCaches(supabase);
  const warmedCacheEntry = columnsByTableCache.get(table);
  if (hasFreshValue(warmedCacheEntry)) {
    return warmedCacheEntry.value ? new Set(warmedCacheEntry.value) : null;
  }

  const resolutionPromise = introspectColumns(supabase, table);
  columnsByTableCache.set(table, {
    expiresAt: Date.now() + SCHEMA_CACHE_TTL_MS,
    promise: resolutionPromise
  });

  try {
    const value = await resolutionPromise;
    columnsByTableCache.set(table, {
      expiresAt: Date.now() + SCHEMA_CACHE_TTL_MS,
      value: value ? new Set(value) : null
    });
    return value ? new Set(value) : null;
  } catch (error) {
    columnsByTableCache.delete(table);
    throw error;
  }
}

export async function resolveAvailableColumnsForCandidates(
  supabase: SupabaseClient,
  table: string,
  candidates: readonly string[]
): Promise<Set<string>> {
  const candidateCacheKey = makeCandidateCacheKey(table, candidates);
  const candidateCacheEntry = columnsByCandidateCache.get(candidateCacheKey);

  if (hasFreshValue(candidateCacheEntry)) {
    return new Set(candidateCacheEntry.value);
  }

  if (candidateCacheEntry?.promise) {
    const pendingValue = await candidateCacheEntry.promise;
    return new Set(pendingValue);
  }

  const introspectedColumns = await resolveColumnsForTable(supabase, table);

  if (introspectedColumns) {
    const availableColumns = new Set(candidates.filter((column) => introspectedColumns.has(column)));
    columnsByCandidateCache.set(candidateCacheKey, cacheValueWithTtl(new Set(availableColumns)));
    return availableColumns;
  }

  const resolutionPromise = Promise.all(
    candidates.map(async (column) => {
      const { error } = await supabase
        .from(table)
        .select(column, { head: true, count: "planned" })
        .limit(1);

      return { column, exists: !error };
    })
  ).then((checks) => new Set(checks.filter((entry) => entry.exists).map((entry) => entry.column)));

  columnsByCandidateCache.set(candidateCacheKey, {
    expiresAt: Date.now() + SCHEMA_CACHE_TTL_MS,
    promise: resolutionPromise
  });

  try {
    const value = await resolutionPromise;
    columnsByCandidateCache.set(candidateCacheKey, cacheValueWithTtl(new Set(value)));
    return value;
  } catch (error) {
    columnsByCandidateCache.delete(candidateCacheKey);
    throw error;
  }
}

export async function resolveAvailableColumns(
  supabase: SupabaseClient,
  table: string
): Promise<Set<string>> {
  return resolveAvailableColumnsForCandidates(supabase, table, COLUMN_PROBE_CANDIDATES);
}

export function getJobTitle(record: JobRecord): string {
  const title = record.title ?? record.case_title ?? record.name;
  return typeof title === "string" && title.trim() ? title.trim() : "(ไม่ระบุชื่องาน)";
}

export function getJobFileUrl(record: JobRecord): string | null {
  const raw = record.doc_url ?? record.file_url ?? record.storage_path;
  return typeof raw === "string" && raw.trim() ? raw : null;
}
