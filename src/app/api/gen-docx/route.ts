import { readFile } from "fs/promises";
import path from "path";

import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import { NextRequest, NextResponse } from "next/server";

import { buildDocxTemplateData, type GeneratePayload } from "@/lib/docxTemplateData";
import { resolveAvailableColumns, resolveJobsTable } from "@/lib/jobs";
import { createSupabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

type GenerateRequestBody = GeneratePayload & {
  jobId?: string;
};

const deriveTitle = (body: GeneratePayload) => body.subject?.trim() || body.purpose?.trim() || "งานสร้างเอกสาร";

const buildPersistedData = (body: GeneratePayload, availableColumns: Set<string>) => {
  const writeData: Record<string, unknown> = {};

  if (availableColumns.has("title")) writeData.title = deriveTitle(body);
  if (availableColumns.has("case_title")) writeData.case_title = deriveTitle(body);
  if (availableColumns.has("name")) writeData.name = deriveTitle(body);
  if (availableColumns.has("department")) writeData.department = body.department?.trim() ?? null;
  if (availableColumns.has("subject")) writeData.subject = body.subject?.trim() ?? null;
  if (availableColumns.has("status")) writeData.status = "generated";
  if (availableColumns.has("payload")) writeData.payload = body;
  if (availableColumns.has("updated_at")) writeData.updated_at = new Date().toISOString();

  return writeData;
};

async function upsertJobRecord(body: GeneratePayload, jobId?: string): Promise<string | null> {
  const supabase = createSupabaseServer();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  const table = await resolveJobsTable(supabase);
  if (!table) {
    return null;
  }

  const availableColumns = await resolveAvailableColumns(supabase, table);
  const writeData = buildPersistedData(body, availableColumns);

  if (jobId) {
    let updateQuery = supabase.from(table).update(writeData).eq("id", jobId);

    if (user && availableColumns.has("user_id")) {
      updateQuery = updateQuery.eq("user_id", user.id);
    }

    const { data, error } = await updateQuery.select("id").limit(1);
    if (error) {
      throw new Error(`ไม่สามารถอัปเดตงานเอกสารได้: ${error.message}`);
    }

    const updated = (data ?? [])[0] as { id?: string } | undefined;
    if (!updated?.id) {
      throw new Error("ไม่พบงานเอกสารที่ต้องการแก้ไข หรือไม่มีสิทธิ์เข้าถึง");
    }

    return updated.id;
  }

  if (availableColumns.has("user_id") && user?.id) {
    writeData.user_id = user.id;
  }

  if (Object.keys(writeData).length === 0) {
    return null;
  }

  const { data, error } = await supabase.from(table).insert(writeData).select("id").limit(1);
  if (error) {
    throw new Error(`ไม่สามารถบันทึกงานเอกสารได้: ${error.message}`);
  }

  const created = (data ?? [])[0] as { id?: string } | undefined;
  return created?.id ?? null;
}

export async function POST(request: NextRequest) {
  try {
    const requestBody = (await request.json()) as GenerateRequestBody;
    const { jobId, ...body } = requestBody;

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

    const createdJobId = await upsertJobRecord(body, jobId);

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
