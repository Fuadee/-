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
  column_name: string | null;
};

export type JobRecord = Record<string, unknown> & {
  revision_note?: string | null;
  revision_requested_at?: string | null;
  revision_requested_by?: string | null;
  assignee_id?: string | null;
  assignee_name?: string | null;
};

export async function resolveJobsTable(supabase: SupabaseClient): Promise<string | null> {
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

export async function resolveAvailableColumnsForCandidates(
  supabase: SupabaseClient,
  table: string,
  candidates: readonly string[]
): Promise<Set<string>> {
  const introspectedColumns = await introspectColumns(supabase, table);

  if (introspectedColumns) {
    return new Set(candidates.filter((column) => introspectedColumns.has(column)));
  }

  const checks = await Promise.all(
    candidates.map(async (column) => {
      const { error } = await supabase
        .from(table)
        .select(column, { head: true, count: "planned" })
        .limit(1);

      return { column, exists: !error };
    })
  );

  return new Set(checks.filter((entry) => entry.exists).map((entry) => entry.column));
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
