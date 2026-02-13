import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type GenSpecRequest = {
  name?: string;
  purpose?: string;
  department?: string;
  style?: "short" | "medium";
};

const sanitizeSpec = (rawSpec: string, style: "short" | "medium"): string => {
  const minLines = style === "short" ? 2 : 4;
  const maxLines = style === "short" ? 3 : 6;

  const lines = rawSpec
    .split("\n")
    .map((line) => line.replace(/^[-•\d.)\s]+/, "").trim())
    .filter(Boolean)
    .slice(0, maxLines);

  if (lines.length >= minLines) {
    return lines.join("\n");
  }

  return lines.join("\n");
};

export async function POST(request: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { message: "ยังไม่ได้ตั้งค่า OPENAI_API_KEY" },
      { status: 500 }
    );
  }

  try {
    const body = (await request.json()) as GenSpecRequest;
    const name = body.name?.trim() ?? "";
    const purpose = body.purpose?.trim() ?? "";
    const department = body.department?.trim() ?? "";
    const style = body.style === "short" ? "short" : "medium";

    if (!name) {
      return NextResponse.json({ message: "กรอกชื่อพัสดุก่อน" }, { status: 400 });
    }

    const client = new OpenAI({ apiKey });
    const lineRule =
      style === "short"
        ? "ตอบ 2-3 บรรทัด"
        : "ตอบ 4-6 บรรทัดแบบกระชับ";

    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      input: [
        {
          role: "system",
          content:
            "คุณเป็นผู้ช่วยจัดทำสเปกพัสดุราชการภาษาไทย ใช้น้ำเสียงทางการ สุภาพ กระชับ และอ่านง่าย"
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `ช่วยเขียนรายละเอียดคุณลักษณะ (spec) สำหรับพัสดุรายการนี้\nชื่อพัสดุ: ${name}\nวัตถุประสงค์การใช้งาน: ${purpose || "ใช้งานทั่วไปในหน่วยงาน"}\nหน่วยงาน/แผนก: ${department || "ไม่ระบุ"}\n\nข้อกำหนด:\n- ${lineRule} และคั่นแต่ละบรรทัดด้วย newline\n- เขียนเป็นข้อความธรรมดา ห้ามใส่เลขลำดับหรือหัวข้อย่อย\n- ห้ามระบุยี่ห้อ รุ่นเฉพาะ หรือราคา\n- หลีกเลี่ยงมาตรฐานเฉพาะทางที่เจาะจงเกินจำเป็น เว้นแต่ชื่อพัสดุบ่งชี้ชัดเจน\n- ควรกล่าวถึงวัสดุ/ขนาดหรือความจุ (ถ้าอนุมานได้), ความเหมาะสมต่อการใช้งาน, ความแข็งแรงหรือคุณภาพ, และความปลอดภัย/สิ่งแวดล้อมเมื่อเกี่ยวข้อง\n- ตอบเป็นภาษาไทยเท่านั้น`
            }
          ]
        }
      ],
      max_output_tokens: style === "short" ? 240 : 420
    });

    const specText = sanitizeSpec(response.output_text.trim(), style);

    return NextResponse.json({ spec: specText });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "ไม่สามารถสร้างรายละเอียดคุณลักษณะได้";
    return NextResponse.json({ message }, { status: 500 });
  }
}
