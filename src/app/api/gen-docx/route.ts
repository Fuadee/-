import { readFile } from "fs/promises";
import path from "path";

import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type ItemPayload = {
  no?: number;
  name?: string;
  qty?: string;
  unit?: string;
  price?: string;
  spec?: string;
  total?: string | number;
};

const parseNumber = (value: string | number | undefined): number => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value !== "string") {
    return 0;
  }
  const normalized = Number(value.replace(/,/g, "").trim());
  return Number.isFinite(normalized) ? normalized : 0;
};

const normalizeItems = (items: ItemPayload[] | null | undefined): ItemPayload[] => {
  if (!Array.isArray(items)) {
    return [];
  }

  return items.map((item, index) => {
    const qty = item.qty ?? "";
    const price = item.price ?? "";
    const computedTotal = parseNumber(qty) * parseNumber(price);

    return {
      no: index + 1,
      name: item.name ?? "",
      qty,
      unit: item.unit ?? "",
      price,
      spec: item.spec ?? "",
      total: item.total ?? computedTotal
    };
  });
};

type GeneratePayload = {
  department?: string | null;
  subject?: string | null;
  subject_detail?: string | null;
  purpose?: string | null;
  budget_amount?: string | null;
  budget_source?: string | null;
  assignee?: string | null;
  items?: ItemPayload[] | null;
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as GeneratePayload;
    const {
      department,
      subject,
      subject_detail,
      purpose,
      budget_amount,
      budget_source,
      assignee,
      items
    } = body;

    const templatePath = process.cwd() + "/templates/template.docx";
    const content = await readFile(path.resolve(templatePath), "binary");

    const zip = new PizZip(content);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true
    });

    doc.render({
      department: department ?? "",
      subject: subject ?? "",
      subject_detail: subject_detail ?? "",
      purpose: purpose ?? "",
      budget_amount: budget_amount ?? "",
      budget_source: budget_source ?? "",
      assignee: assignee ?? "",
      items: normalizeItems(items)
    });

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
        "Content-Disposition": `attachment; filename*=UTF-8''${encodedFilename}`
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
