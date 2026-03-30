import type { SupabaseClient } from "@supabase/supabase-js";

import type { JobRecord } from "@/lib/jobs";

const PROJECTION_TABLE = "dashboard_jobs_projection";
const COMPLETED_STATUS = "completed";

const isProjectionEnabled = (): boolean => process.env.DASHBOARD_USE_PROJECTION === "1";

const asTrimmedString = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

const normalizeStatus = (value: unknown): string => {
  const raw = asTrimmedString(value);
  if (!raw || raw === "generated") {
    return "pending_approval";
  }

  if (raw === "ดำเนินการแล้วเสร็จ") {
    return COMPLETED_STATUS;
  }

  if (
    raw === "precheck_pending" ||
    raw === "document_pending" ||
    raw === "pending_approval" ||
    raw === "pending_review" ||
    raw === "awaiting_payment" ||
    raw === "needs_fix" ||
    raw === "completed"
  ) {
    return raw;
  }

  return "pending_approval";
};

const parsePayload = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }

  return {};
};

const deriveTitle = (job: JobRecord): string => {
  const payload = parsePayload(job.payload);
  return (
    asTrimmedString(job.title) ||
    asTrimmedString(job.case_title) ||
    asTrimmedString(job.name) ||
    asTrimmedString(payload.title) ||
    asTrimmedString(payload.case_title) ||
    asTrimmedString(payload.name) ||
    asTrimmedString(payload.subject_detail) ||
    "(ไม่ระบุชื่องาน)"
  );
};

const deriveAssigneeName = (job: JobRecord): string => {
  const payload = parsePayload(job.payload);
  return (
    asTrimmedString(job.assignee_name) ||
    asTrimmedString(job.assigned_to_name) ||
    asTrimmedString(job.assigned_to) ||
    asTrimmedString(job.assignee) ||
    asTrimmedString(payload.assignee) ||
    asTrimmedString(payload.assignee_name) ||
    asTrimmedString(payload.assigned_to_name) ||
    asTrimmedString(payload.assigned_to)
  );
};

const deriveCreatedByName = (job: JobRecord, userName: string | null): string => {
  const payload = parsePayload(job.payload);
  return (
    asTrimmedString(userName) ||
    asTrimmedString(job.created_by_name) ||
    asTrimmedString(job.requester_name) ||
    asTrimmedString(job.created_by) ||
    asTrimmedString(payload.requester_name) ||
    "ไม่ระบุผู้สร้าง"
  );
};

const deriveDepartment = (job: JobRecord): string => {
  const payload = parsePayload(job.payload);
  return asTrimmedString(job.department) || asTrimmedString(payload.department) || "ไม่ระบุแผนก";
};

const deriveJobCode = (jobId: string): string => {
  if (/^\d+$/.test(jobId)) {
    return `JOB-${jobId.padStart(5, "0").slice(-5)}`;
  }

  return `JOB-${jobId.slice(-5)}`;
};

const deriveSearchText = ({
  jobId,
  title,
  normalizedStatus,
  createdByName,
  department,
  taxId,
  assigneeName
}: {
  jobId: string;
  title: string;
  normalizedStatus: string;
  createdByName: string;
  department: string;
  taxId: string;
  assigneeName: string;
}): string =>
  [jobId, title, normalizedStatus, createdByName, department, taxId, assigneeName]
    .map((value) => value.trim())
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase();

const toProjectionRow = (job: JobRecord, userName: string | null) => {
  const jobId = asTrimmedString(job.id);
  const normalizedStatus = normalizeStatus(job.status);
  const title = deriveTitle(job);
  const createdByName = deriveCreatedByName(job, userName);
  const assigneeName = deriveAssigneeName(job);
  const department = deriveDepartment(job);
  const taxId = asTrimmedString(job.tax_id);
  const createdAt = asTrimmedString(job.created_at) || new Date().toISOString();
  const updatedAt = asTrimmedString(job.updated_at) || createdAt;

  return {
    job_id: jobId,
    user_id: asTrimmedString(job.user_id) || null,
    title,
    normalized_status: normalizedStatus,
    raw_status: asTrimmedString(job.status) || null,
    is_completed: normalizedStatus === COMPLETED_STATUS,
    is_active: normalizedStatus !== COMPLETED_STATUS,
    created_at: createdAt,
    updated_at: updatedAt,
    created_by: asTrimmedString(job.created_by) || null,
    requester_name: asTrimmedString(job.requester_name) || null,
    created_by_name: createdByName,
    assignee_name: assigneeName || null,
    department,
    tax_id: taxId || null,
    job_code: deriveJobCode(jobId),
    search_text: deriveSearchText({ jobId, title, normalizedStatus, createdByName, department, taxId, assigneeName })
  };
};

export const projectionEnabled = isProjectionEnabled;

export async function upsertDashboardProjectionFromJobRecord(
  supabase: SupabaseClient,
  job: JobRecord,
  userName: string | null
): Promise<void> {
  if (!isProjectionEnabled()) {
    return;
  }

  const jobId = asTrimmedString(job.id);
  if (!jobId) {
    return;
  }

  const { error } = await supabase.from(PROJECTION_TABLE).upsert(toProjectionRow(job, userName), {
    onConflict: "job_id"
  });

  if (error) {
    console.error("[dashboard-projection] upsert-from-record-failed", { jobId, error: error.message });
    throw new Error(`dashboard projection upsert failed: ${error.message}`);
  }

  console.info("[dashboard-projection] upsert-from-record-success", { jobId });
}

export async function syncDashboardProjectionByJobId(supabase: SupabaseClient, jobId: string): Promise<void> {
  if (!isProjectionEnabled()) {
    return;
  }

  const { error } = await supabase.rpc("dashboard_backfill_projection", { p_job_id: jobId });

  if (error) {
    console.error("[dashboard-projection] sync-by-job-id-failed", { jobId, error: error.message });
    throw new Error(`dashboard projection sync failed: ${error.message}`);
  }

  console.info("[dashboard-projection] sync-by-job-id-success", { jobId });
}

export type DashboardProjectionRow = {
  job_id: string;
  user_id: string | null;
  title: string;
  normalized_status: string;
  raw_status: string | null;
  is_completed: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  requester_name: string | null;
  created_by_name: string;
  assignee_name: string | null;
  department: string | null;
  tax_id: string | null;
  job_code: string;
  search_text: string;
};

export const DASHBOARD_PROJECTION_SELECT =
  "job_id,user_id,title,normalized_status,raw_status,is_completed,is_active,created_at,updated_at,created_by,requester_name,created_by_name,assignee_name,department,tax_id,job_code,search_text";

export const mapProjectionRowToJobRecord = (row: DashboardProjectionRow): JobRecord => ({
  id: row.job_id,
  title: row.title,
  status: row.normalized_status,
  created_at: row.created_at,
  updated_at: row.updated_at,
  user_id: row.user_id,
  created_by: row.created_by,
  requester_name: row.requester_name,
  created_by_name: row.created_by_name,
  assignee_name: row.assignee_name,
  department: row.department,
  tax_id: row.tax_id,
  job_code: row.job_code,
  search_text: row.search_text
});
