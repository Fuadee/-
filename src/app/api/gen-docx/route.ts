import { readFile } from "fs/promises";
import path from "path";

import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import { NextRequest, NextResponse } from "next/server";

import { buildDocxTemplateData, type GeneratePayload } from "@/lib/docxTemplateData";
import { resolveAvailableColumns, resolveJobsTable, type JobRecord } from "@/lib/jobs";
import { sendLineGroupNotification } from "@/lib/line";
import { buildPrecheckPendingLineMessage, resolveRequesterName } from "@/lib/lineNotifications";
import { createSupabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

type GenerateRequestBody = GeneratePayload & {
  jobId?: string;
  submissionMode?: "main" | "precheck";
};

const PRECHECK_DEBUG_PREFIX = "[precheck-line]";

const deriveTitle = (body: GeneratePayload) => body.subject?.trim() || body.purpose?.trim() || "งานสร้างเอกสาร";

const toNullableTrimmedString = (value: string | null | undefined) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};


const asTrimmedString = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

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

const buildPersistedData = (body: GeneratePayload, availableColumns: Set<string>, submissionMode: "main" | "precheck") => {
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
  if (availableColumns.has("status")) writeData.status = submissionMode === "precheck" ? "precheck_pending" : "generated";
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
  nextStatus: string | null;
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
      nextStatus: null,
      shouldSendPrecheckLineReason: "jobs table not found"
    };
  }

  const availableColumns = await resolveAvailableColumns(supabase, table);
  const writeData = buildPersistedData(body, availableColumns, submissionMode);

  if (jobId) {
    let updateQuery = supabase.from(table).update(writeData).eq("id", jobId);

    if (user && availableColumns.has("user_id")) {
      updateQuery = updateQuery.eq("user_id", user.id);
    }

    let previousStatusQuery = supabase.from(table).select("status").eq("id", jobId).limit(1);
    if (user && availableColumns.has("user_id")) {
      previousStatusQuery = previousStatusQuery.eq("user_id", user.id);
    }
    const previousStatusResult = await previousStatusQuery;
    const previousStatus = ((previousStatusResult.data ?? [])[0] as { status?: string } | undefined)?.status?.trim() ?? "";
    const nextStatus = submissionMode === "precheck" ? "precheck_pending" : "generated";
    const shouldSendPrecheckLine = submissionMode === "precheck" && previousStatus !== "precheck_pending";
    const shouldSendPrecheckLineReason =
      submissionMode !== "precheck"
        ? "submissionMode is not precheck"
        : previousStatus === "precheck_pending"
          ? "previous status already precheck_pending"
          : "precheck update and previous status is not precheck_pending";

    const { data, error } = await updateQuery.select("*").limit(1);
    if (error) {
      throw new Error(`ไม่สามารถอัปเดตงานเอกสารได้: ${error.message}`);
    }

    const updated = ((data ?? [])[0] ?? null) as JobRecord | null;
    if (!updated?.id) {
      throw new Error("ไม่พบงานเอกสารที่ต้องการแก้ไข หรือไม่มีสิทธิ์เข้าถึง");
    }

    return {
      jobId: String(updated.id),
      job: updated,
      shouldSendPrecheckLine,
      operation: "update",
      previousStatus: previousStatus || null,
      nextStatus,
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
      nextStatus: null,
      shouldSendPrecheckLineReason: "empty write data"
    };
  }

  const { data, error } = await supabase.from(table).insert(writeData).select("*").limit(1);
  if (error) {
    throw new Error(`ไม่สามารถบันทึกงานเอกสารได้: ${error.message}`);
  }

  const created = ((data ?? [])[0] ?? null) as JobRecord | null;

  return {
    jobId: created?.id ? String(created.id) : null,
    job: created,
    shouldSendPrecheckLine: submissionMode === "precheck",
    operation: "create",
    previousStatus: null,
    nextStatus: submissionMode === "precheck" ? "precheck_pending" : "generated",
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
      nextStatus,
      shouldSendPrecheckLineReason
    } = await upsertJobRecord(body, jobId, submissionMode);

    console.info(`${PRECHECK_DEBUG_PREFIX} upsert result`, {
      operation,
      submissionMode,
      previousStatus,
      nextStatus,
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

      const origin = getOriginFromRequest(request);
      const resolvedJobId = createdJobId ?? String(savedJob.id ?? "").trim();
      const jobUrl = `${origin}/dashboard/${encodeURIComponent(resolvedJobId)}`;

      const createdAtRaw = typeof savedJob.created_at === "string" ? savedJob.created_at : null;
      const createdAt = createdAtRaw ? new Date(createdAtRaw) : new Date();

      const lineMessage = buildPrecheckPendingLineMessage({
        payload: savedJob.payload ?? body,
        requesterName: resolveRequesterName(user),
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
