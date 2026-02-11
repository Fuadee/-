import { readFile } from "fs/promises";
import path from "path";

import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type GeneratePayload = {
  subject?: string | null;
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as GeneratePayload;
    const subject = body?.subject;

    const templatePath = process.cwd() + "/templates/template.docx";
    const content = await readFile(path.resolve(templatePath), "binary");

    const zip = new PizZip(content);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true
    });

    doc.render({
      subject: subject ?? ""
    });

    const buffer = doc.getZip().generate({
      type: "uint8array",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    });

    const date = new Date().toISOString().slice(0, 10);
    const filename = `หนังสือราชการ_${date}.docx`;
    const encodedFilename = encodeURIComponent(filename);

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodedFilename}`
      }
    });
  } catch (error) {
    console.error("DOCX generation error", error);
    return NextResponse.json(
      { message: "Failed to generate DOCX" },
      { status: 500 }
    );
  }
}
