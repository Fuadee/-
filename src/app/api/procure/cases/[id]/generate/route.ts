import { readFile } from "fs/promises";
import path from "path";

import Docxtemplater from "docxtemplater";
import { NextRequest, NextResponse } from "next/server";
import PizZip from "pizzip";

import { buildDocxTemplateData } from "@/lib/docxTemplateData";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { data: procurementCase, error: caseError } = await supabase
    .from("procure_cases")
    .select("id, status, form_data, doc_version")
    .eq("id", id)
    .eq("created_by", user.id)
    .single();

  if (caseError || !procurementCase) {
    return NextResponse.json({ message: caseError?.message ?? "Case not found" }, { status: 404 });
  }

  const templatePath = process.env.TEMPLATE_PATH || "server/templates/procurement_basic_v1.docx";

  let content: string;
  try {
    content = await readFile(path.resolve(templatePath), "binary");
  } catch {
    return NextResponse.json({ message: `Template file not found: ${templatePath}` }, { status: 400 });
  }
  const zip = new PizZip(content);
  const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
  doc.render(buildDocxTemplateData((procurementCase.form_data ?? {}) as Record<string, unknown>));

  const buffer = doc.getZip().generate({
    type: "uint8array",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  });

  const nextVersion = (procurementCase.doc_version ?? 0) + 1;
  const objectPath = `${id}/v${nextVersion}.docx`;

  const admin = createSupabaseAdminClient();
  const { error: uploadError } = await admin.storage
    .from("docs")
    .upload(objectPath, Buffer.from(buffer), {
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      upsert: true
    });

  if (uploadError) {
    return NextResponse.json({ message: uploadError.message }, { status: 400 });
  }

  const statusAfterGenerate =
    procurementCase.status === "REVISION_REQUIRED" ? "WAIT_REVIEW" : procurementCase.status;

  const { error: updateError } = await supabase
    .from("procure_cases")
    .update({
      doc_url: objectPath,
      doc_version: nextVersion,
      status: statusAfterGenerate
    })
    .eq("id", id)
    .eq("created_by", user.id);

  if (updateError) {
    return NextResponse.json({ message: updateError.message }, { status: 400 });
  }

  if (procurementCase.status === "REVISION_REQUIRED") {
    await supabase.from("procure_case_events").insert({
      case_id: id,
      from_status: "REVISION_REQUIRED",
      to_status: "WAIT_REVIEW",
      action: "GENERATE_FROM_REVISION",
      note: "ผู้ใช้แก้ไขและ Generate เอกสารใหม่",
      created_by: user.id
    });
  }

  return NextResponse.json({ ok: true, doc_url: objectPath, doc_version: nextVersion });
}
