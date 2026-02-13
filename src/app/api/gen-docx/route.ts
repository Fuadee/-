import { readFile } from "fs/promises";
import path from "path";

import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import { NextRequest, NextResponse } from "next/server";

import { buildDocxTemplateData, type GeneratePayload } from "@/lib/docxTemplateData";
import { resolveAvailableColumns, resolveJobsTable } from "@/lib/jobs";
import { createSupabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

async function createJobRecord(body: GeneratePayload): Promise<string | null> {
  const supabase = createSupabaseServer();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  const table = await resolveJobsTable(supabase);
  if (!table) {
    return null;
  }

  const availableColumns = await resolveAvailableColumns(supabase, table);
  const insertData: Record<string, unknown> = {};

  if (availableColumns.has("user_id") && user?.id) {
    insertData.user_id = user.id;
  }

  const inferredTitle = body.subject?.trim() || body.purpose?.trim() || "งานสร้างเอกสาร";
  if (availableColumns.has("title")) insertData.title = inferredTitle;
  if (availableColumns.has("case_title")) insertData.case_title = inferredTitle;
  if (availableColumns.has("name")) insertData.name = inferredTitle;
  if (availableColumns.has("department")) insertData.department = body.department?.trim() ?? null;
  if (availableColumns.has("subject")) insertData.subject = body.subject?.trim() ?? null;
  if (availableColumns.has("status")) insertData.status = "generated";
  if (availableColumns.has("payload")) insertData.payload = body;

  if (Object.keys(insertData).length === 0) {
    return null;
  }

  const { data, error } = await supabase.from(table).insert(insertData).select("id").limit(1);
  if (error) {
    return null;
  }

  const created = (data ?? [])[0] as { id?: string } | undefined;
  return created?.id ?? null;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as GeneratePayload;

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

    const createdJobId = await createJobRecord(body);

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
