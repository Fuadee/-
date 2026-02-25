import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // log ไว้ดูใน Vercel Logs
    console.log("LINE webhook body:", body);

    // ดึง groupId จาก event แรกที่เป็น group
    const events = body?.events ?? [];
    for (const ev of events) {
      const groupId = ev?.source?.groupId;
      if (groupId) {
        console.log("✅ Detected groupId:", groupId);
        // ตอนนี้ยังไม่เก็บ DB แค่ log ออกมาก่อน
        break;
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("LINE webhook error:", e);
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}

// LINE บางทีส่ง GET มาทดสอบ
export async function GET() {
  return NextResponse.json({ ok: true });
}
