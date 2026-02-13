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
  "created_at",
  "status",
  "doc_url",
  "file_url",
  "storage_path",
  "payload",
  "updated_at"
] as const;

export type JobRecord = Record<string, unknown>;

export async function resolveJobsTable(supabase: SupabaseClient): Promise<string | null> {
  for (const table of JOB_TABLE_CANDIDATES) {
    const { error } = await supabase.from(table).select("*").limit(1);
    if (!error) {
      return table;
    }
  }

  return null;
}

export async function resolveAvailableColumns(
  supabase: SupabaseClient,
  table: string
): Promise<Set<string>> {
  const columns = new Set<string>();

  for (const column of COLUMN_PROBE_CANDIDATES) {
    const { error } = await supabase.from(table).select(column).limit(1);
    if (!error) {
      columns.add(column);
    }
  }

  return columns;
}

export function getJobTitle(record: JobRecord): string {
  const title = record.title ?? record.case_title ?? record.name;
  return typeof title === "string" && title.trim() ? title.trim() : "(ไม่ระบุชื่องาน)";
}

export function getJobFileUrl(record: JobRecord): string | null {
  const raw = record.doc_url ?? record.file_url ?? record.storage_path;
  return typeof raw === "string" && raw.trim() ? raw : null;
}
