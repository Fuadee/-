import { readFile } from "fs/promises";
import path from "path";

import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import { NextRequest, NextResponse } from "next/server";

import { buildDocxTemplateData, type GeneratePayload } from "@/lib/docxTemplateData";
import { upsertDashboardProjectionFromJobRecord } from "@/lib/dashboardProjection";
import { resolveAvailableColumns, resolveJobsTable, type JobRecord } from "@/lib/jobs";
import { sendLineGroupNotification } from "@/lib/line";
import { buildPrecheckPendingLineMessage, resolveRequesterProfile } from "@/lib/lineNotifications";
import { createSupabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

type GenerateRequestBody = GeneratePayload & {
  jobId?: string;
  submissionMode?: "main" | "precheck";
};

const PRECHECK_DEBUG_PREFIX = "[precheck-line]";
const PRECHECK_PENDING_STATUS = "precheck_pending";
const DOCUMENT_PENDING_STATUS = "document_pending";
const PENDING_REVIEW_STATUS = "pending_review";
const PENDING_APPROVAL_STATUS = "pending_approval";

const deriveTitle = (body: GeneratePayload) => body.subject?.trim() || body.purpose?.trim() || "งานสร้างเอกสาร";

const toNullableTrimmedString = (value: string | null | undefined) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};


const asTrimmedString = (value: unknown): string => (typeof value === "string" ? value.trim() : "");
const resolveActorName = (user: { email?: string | null; user_metadata?: Record<string, unknown> | null } | null): string | null =>
  asTrimmedString(user?.user_metadata?.full_name) || asTrimmedString(user?.user_metadata?.name) || asTrimmedString(user?.email) || null;

const parsePayload = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const resolveDefaultStatusBySubmissionMode = (submissionMode: "main" | "precheck") =>
  submissionMode === "precheck" ? PRECHECK_PENDING_STATUS : PENDING_APPROVAL_STATUS;

const resolveNextStatusForSubmission = ({
  previousStatus,
  submissionMode,
  returnFromStatus,
  jobId
}: {
  previousStatus: string;
  submissionMode: "main" | "precheck";
  returnFromStatus: string;
  jobId: string;
}): { nextStatus: string; bypassPrevented: boolean } => {
  const requestedNextStatus = resolveDefaultStatusBySubmissionMode(submissionMode);
  if (previousStatus !== "needs_fix") {
    if (previousStatus === DOCUMENT_PENDING_STATUS) {
      return {
        nextStatus: PENDING_APPROVAL_STATUS,
        bypassPrevented: requestedNextStatus !== PENDING_APPROVAL_STATUS
      };
    }

    return {
      nextStatus: requestedNextStatus,
      bypassPrevented: false
    };
  }

  if (returnFromStatus === PRECHECK_PENDING_STATUS) {
    return {
      nextStatus: PRECHECK_PENDING_STATUS,
      bypassPrevented: requestedNextStatus !== PRECHECK_PENDING_STATUS
    };
  }

  if (returnFromStatus === PENDING_REVIEW_STATUS) {
    return {
      nextStatus: PENDING_REVIEW_STATUS,
      bypassPrevented: true
    };
  }

  console.warn("[gen-docx] needs_fix without return_from_status; fallback to submissionMode (legacy data)", {
    jobId,
    previousStatus,
    submissionMode,
    returnFromStatus: returnFromStatus || null
  });
  return {
    nextStatus: requestedNextStatus,
    bypassPrevented: false
  };
};

const resolveAssigneeNameFromJobOrPayload = (job: JobRecord | null, payload: unknown): string => {
  const parsedPayload = parsePayload(payload);

  return (
    asTrimmedString(parsedPayload.assignee) ||
    asTrimmedString(job?.assignee) ||
    asTrimmedString(parsedPayload.assignee_name) ||
    asTrimmedString(job?.assignee_name) ||
    asTrimmedString(parsedPayload.assigned_to_name) ||
    asTrimmedString(job?.assigned_to_name) ||
    asTrimmedString(parsedPayload.assignedToName) ||
    asTrimmedString(parsedPayload.receiver_name) ||
    asTrimmedString(job?.receiver_name) ||
    asTrimmedString(parsedPayload.recipient_name) ||
    asTrimmedString(job?.recipient_name) ||
    asTrimmedString(parsedPayload.delegate_name) ||
    asTrimmedString(job?.delegate_name) ||
    asTrimmedString(parsedPayload.owner_name) ||
    asTrimmedString(job?.owner_name)
  );
};

const getOriginFromRequest = (request: NextRequest): string => {
  const envBaseUrl =
    asTrimmedString(process.env.NEXT_PUBLIC_APP_URL) ||
    asTrimmedString(process.env.APP_URL) ||
    asTrimmedString(process.env.BASE_URL);

  if (envBaseUrl) {
    return envBaseUrl.replace(/\/$/, "");
  }

  const origin = request.nextUrl.origin || `${request.headers.get("x-forwarded-proto") ?? "https"}://${request.headers.get("host") ?? ""}`;
  return origin.replace(/\/$/, "");
};

const buildPersistedData = (body: GeneratePayload, availableColumns: Set<string>, nextStatus: string) => {
  const writeData: Record<string, unknown> = {};

  if (availableColumns.has("title")) writeData.title = deriveTitle(body);
  if (availableColumns.has("case_title")) writeData.case_title = deriveTitle(body);
  if (availableColumns.has("name")) writeData.name = deriveTitle(body);
  if (availableColumns.has("department")) writeData.department = body.department?.trim() ?? null;
  if (availableColumns.has("subject")) writeData.subject = body.subject?.trim() ?? null;
  if (availableColumns.has("receipt_date")) writeData.receipt_date = body.receipt_date || null;
  if (availableColumns.has("tax_id")) writeData.tax_id = toNullableTrimmedString(body.tax_id);
  if (availableColumns.has("payment_method")) writeData.payment_method = body.payment_method ?? "credit";
  if (availableColumns.has("assignee_emp_code")) {
    writeData.assignee_emp_code = toNullableTrimmedString(body.assignee_emp_code);
  }
  if (availableColumns.has("loan_doc_no")) {
    writeData.loan_doc_no = toNullableTrimmedString(body.loan_doc_no);
  }
  if (availableColumns.has("status")) writeData.status = nextStatus;
  if (availableColumns.has("payload")) writeData.payload = body;
  if (availableColumns.has("updated_at")) writeData.updated_at = new Date().toISOString();

  return writeData;
};

type UpsertResult = {
  jobId: string | null;
  job: JobRecord | null;
  shouldSendPrecheckLine: boolean;
  operation: "create" | "update";
  previousStatus: string | null;
  returnFromStatus: string | null;
  nextStatus: string | null;
  bypassPrevented: boolean;
  shouldSendPrecheckLineReason: string;
};

async function upsertJobRecord(body: GeneratePayload, jobId?: string, submissionMode: "main" | "precheck" = "main"): Promise<UpsertResult> {
  const supabase = createSupabaseServer();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  const table = await resolveJobsTable(supabase);
  if (!table) {
    return {
      jobId: null,
      job: null,
      shouldSendPrecheckLine: false,
      operation: jobId ? "update" : "create",
      previousStatus: null,
      returnFromStatus: null,
      nextStatus: null,
      bypassPrevented: false,
      shouldSendPrecheckLineReason: "jobs table not found"
    };
  }

  const availableColumns = await resolveAvailableColumns(supabase, table);
  const defaultNextStatus = resolveDefaultStatusBySubmissionMode(submissionMode);
  const writeData = buildPersistedData(body, availableColumns, defaultNextStatus);

  if (jobId) {
    let updateQuery = supabase.from(table).update(writeData).eq("id", jobId);

    if (user && availableColumns.has("user_id")) {
      updateQuery = updateQuery.eq("user_id", user.id);
    }

    const statusSelectColumns = ["status", "return_from_status", "revision_phase"]
      .filter((column) => availableColumns.has(column))
      .join(",");

    let previousStatusQuery = supabase.from(table).select(statusSelectColumns || "status").eq("id", jobId).limit(1);
    if (user && availableColumns.has("user_id")) {
      previousStatusQuery = previousStatusQuery.eq("user_id", user.id);
    }
    const previousStatusResult = await previousStatusQuery;
    const previousStatusRow = ((previousStatusResult.data ?? [])[0] ?? null) as
      | { status?: string; return_from_status?: string; revision_phase?: string }
      | null;
    const previousStatus = previousStatusRow?.status?.trim() ?? "";
    const returnFromStatus = previousStatusRow?.return_from_status?.trim() ?? "";
    const revisionPhase = previousStatusRow?.revision_phase?.trim() ?? "";
    const { nextStatus, bypassPrevented } = resolveNextStatusForSubmission({
      previousStatus,
      submissionMode,
      returnFromStatus,
      jobId
    });
    writeData.status = nextStatus;
    if (previousStatus === "needs_fix") {
      if (availableColumns.has("return_from_status")) {
        writeData.return_from_status = null;
      }
      if (availableColumns.has("revision_phase")) {
        writeData.revision_phase = null;
      }
    }
    const shouldSendPrecheckLine = submissionMode === "precheck" && previousStatus !== PRECHECK_PENDING_STATUS;
    const shouldSendPrecheckLineReason =
      submissionMode !== "precheck"
        ? "submissionMode is not precheck"
        : previousStatus === PRECHECK_PENDING_STATUS
          ? "previous status already precheck_pending"
          : "precheck update and previous status is not precheck_pending";

    console.info("[gen-docx] resolved submission transition", {
      jobId,
      previousStatus: previousStatus || null,
      requestedSubmissionMode: submissionMode,
      returnFromStatus: returnFromStatus || null,
      revisionPhase: revisionPhase || null,
      resolvedNextStatus: nextStatus,
      bypassPrevented,
      source: "edit"
    });

    const { data, error } = await updateQuery.select("*").limit(1);
    if (error) {
      throw new Error(`ไม่สามารถอัปเดตงานเอกสารได้: ${error.message}`);
    }

    const updated = ((data ?? [])[0] ?? null) as JobRecord | null;
    if (!updated?.id) {
      throw new Error("ไม่พบงานเอกสารที่ต้องการแก้ไข หรือไม่มีสิทธิ์เข้าถึง");
    }
    try {
      await upsertDashboardProjectionFromJobRecord(supabase, updated, resolveActorName(user));
    } catch (projectionError) {
      console.error("[dashboard-projection] sync-after-gen-docx-update-failed", { jobId: String(updated.id), projectionError });
    }

    return {
      jobId: String(updated.id),
      job: updated,
      shouldSendPrecheckLine,
      operation: "update",
      previousStatus: previousStatus || null,
      returnFromStatus: returnFromStatus || null,
      nextStatus,
      bypassPrevented,
      shouldSendPrecheckLineReason
    };
  }

  if (availableColumns.has("user_id") && user?.id) {
    writeData.user_id = user.id;
  }

  if (Object.keys(writeData).length === 0) {
    return {
      jobId: null,
      job: null,
      shouldSendPrecheckLine: false,
      operation: "create",
      previousStatus: null,
      returnFromStatus: null,
      nextStatus: null,
      bypassPrevented: false,
      shouldSendPrecheckLineReason: "empty write data"
    };
  }

  const { data, error } = await supabase.from(table).insert(writeData).select("*").limit(1);
  if (error) {
    throw new Error(`ไม่สามารถบันทึกงานเอกสารได้: ${error.message}`);
  }

  const created = ((data ?? [])[0] ?? null) as JobRecord | null;
  if (created?.id) {
    try {
      await upsertDashboardProjectionFromJobRecord(supabase, created, resolveActorName(user));
    } catch (projectionError) {
      console.error("[dashboard-projection] sync-after-gen-docx-create-failed", { jobId: String(created.id), projectionError });
    }
  }

  console.info("[gen-docx] resolved submission transition", {
    jobId: created?.id ? String(created.id) : null,
    previousStatus: null,
    requestedSubmissionMode: submissionMode,
    returnFromStatus: null,
    revisionPhase: null,
    resolvedNextStatus: defaultNextStatus,
    bypassPrevented: false,
    source: "new"
  });

  return {
    jobId: created?.id ? String(created.id) : null,
    job: created,
    shouldSendPrecheckLine: submissionMode === "precheck",
    operation: "create",
    previousStatus: null,
    returnFromStatus: null,
    nextStatus: defaultNextStatus,
    bypassPrevented: false,
    shouldSendPrecheckLineReason:
      submissionMode === "precheck" ? "new precheck job" : "submissionMode is not precheck"
  };
}

export async function POST(request: NextRequest) {
  try {
    console.info(`${PRECHECK_DEBUG_PREFIX} route entered`, {
      method: request.method,
      path: request.nextUrl.pathname
    });

    const requestBody = (await request.json()) as GenerateRequestBody;
    const { jobId, submissionMode = "main", ...body } = requestBody;
    console.info(`${PRECHECK_DEBUG_PREFIX} parsed request body`, {
      submissionMode,
      jobId: jobId ?? null
    });

    const {
      jobId: createdJobId,
      job: savedJob,
      shouldSendPrecheckLine,
      operation,
      previousStatus,
      returnFromStatus,
      nextStatus,
      bypassPrevented,
      shouldSendPrecheckLineReason
    } = await upsertJobRecord(body, jobId, submissionMode);

    console.info(`${PRECHECK_DEBUG_PREFIX} upsert result`, {
      operation,
      requestedSubmissionMode: submissionMode,
      previousStatus,
      returnFromStatus,
      nextStatus,
      bypassPrevented,
      shouldSendPrecheckLine,
      shouldSendPrecheckLineReason,
      createdJobId: createdJobId ?? null
    });

    const missingLineEnv =
      !asTrimmedString(process.env.LINE_CHANNEL_ACCESS_TOKEN) || !asTrimmedString(process.env.LINE_GROUP_ID);

    if (missingLineEnv) {
      console.warn(`${PRECHECK_DEBUG_PREFIX} missing LINE env`, {
        hasLineChannelAccessToken: Boolean(asTrimmedString(process.env.LINE_CHANNEL_ACCESS_TOKEN)),
        hasLineGroupId: Boolean(asTrimmedString(process.env.LINE_GROUP_ID))
      });
    }

    if (submissionMode !== "precheck") {
      console.info(`${PRECHECK_DEBUG_PREFIX} skip LINE`, {
        reason: "submissionMode is not precheck"
      });
    } else if (!shouldSendPrecheckLine) {
      console.info(`${PRECHECK_DEBUG_PREFIX} skip LINE`, {
        reason: shouldSendPrecheckLineReason
      });
    } else if (!savedJob) {
      console.info(`${PRECHECK_DEBUG_PREFIX} skip LINE`, {
        reason: "saved job not found after upsert"
      });
    } else if (missingLineEnv) {
      console.info(`${PRECHECK_DEBUG_PREFIX} skip LINE`, {
        reason: "missing LINE env"
      });
    } else {
      const supabase = createSupabaseServer();
      const {
        data: { user }
      } = await supabase.auth.getUser();
      const requesterProfile = resolveRequesterProfile(user);

      const origin = getOriginFromRequest(request);
      const resolvedJobId = createdJobId ?? String(savedJob.id ?? "").trim();
      const jobUrl = `${origin}/dashboard/${encodeURIComponent(resolvedJobId)}`;

      const createdAtRaw = typeof savedJob.created_at === "string" ? savedJob.created_at : null;
      const createdAt = createdAtRaw ? new Date(createdAtRaw) : new Date();
      const payloadForLine = savedJob.payload ?? body;
      const assigneeName = resolveAssigneeNameFromJobOrPayload(savedJob, payloadForLine);

      const lineMessage = buildPrecheckPendingLineMessage({
        payload: payloadForLine,
        assigneeName,
        requesterName: requesterProfile.requesterName,
        requesterDisplayName: requesterProfile.requesterDisplayName,
        requesterEmail: requesterProfile.requesterEmail,
        createdAt: Number.isNaN(createdAt.getTime()) ? new Date() : createdAt,
        jobUrl
      });

      try {
        console.info(`${PRECHECK_DEBUG_PREFIX} sendLineGroupNotification called`, {
          jobId: resolvedJobId
        });
        await sendLineGroupNotification(lineMessage);
        console.info(`${PRECHECK_DEBUG_PREFIX} LINE success`, {
          jobId: resolvedJobId
        });
      } catch (lineError) {
        console.error(`${PRECHECK_DEBUG_PREFIX} LINE error`, {
          jobId: resolvedJobId,
          message: lineError instanceof Error ? lineError.message : String(lineError),
          error: lineError
        });
      }
    }

    if (submissionMode === "precheck") {
      return NextResponse.json({
        ok: true,
        message: "บันทึกงานและส่งรอตรวจเบื้องต้นแล้ว",
        jobId: createdJobId
      });
    }

    const templatePath = process.cwd() + "/templates/template.docx";
    const content = await readFile(path.resolve(templatePath), "binary");

    const zip = new PizZip(content);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true
    });

    doc.render(buildDocxTemplateData(body));

    const buffer = doc.getZip().generate({
      type: "uint8array",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    });

    const date = new Date().toISOString().slice(0, 10);
    const filename = `หนังสือราชการ_${date}.docx`;
    const encodedFilename = encodeURIComponent(filename);

    return new NextResponse(Buffer.from(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodedFilename}`,
        ...(createdJobId ? { "x-job-id": createdJobId } : {})
      }
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        message: (err as { message?: string } | null)?.message ?? "unknown",
        properties: (err as { properties?: unknown } | null)?.properties ?? null
      },
      { status: 500 }
    );
  }
}
