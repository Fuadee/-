import { NextResponse } from "next/server";

import { sendLineGroupNotification } from "@/lib/line";
import { createSupabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

const formatThaiDateTime = (date: Date): string =>
  new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(date);

const toReadableError = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  return "ไม่สามารถส่งข้อความทดสอบ LINE ได้";
};

export async function POST() {
  console.info("line-test-route-start");
  console.info("line-test-env-token-present:", Boolean(process.env.LINE_CHANNEL_ACCESS_TOKEN));
  console.info("line-test-env-group-present:", Boolean(process.env.LINE_GROUP_ID));

  try {
    const supabase = createSupabaseServer();

    console.info("line-test-auth-user-start");
    const {
      data: { user }
    } = await supabase.auth.getUser();
    console.info("line-test-auth-user-end", { hasUser: Boolean(user?.id) });

    if (!user) {
      return NextResponse.json(
        {
          ok: false,
          error: "กรุณาเข้าสู่ระบบก่อนทดสอบ LINE"
        },
        { status: 401 }
      );
    }

    const userEmail = user.email?.trim() || "unknown-user";
    const lineMessage = [
      "✅ LINE TEST",
      "ระบบ DOCX Generator สามารถใช้งานได้ปกติ",
      `เวลาทดสอบ: ${formatThaiDateTime(new Date())}`,
      `ผู้ทดสอบ: ${userEmail}`
    ].join("\n");

    console.info("line-test-send-start");
    await sendLineGroupNotification(lineMessage);
    console.info("line-test-send-success");

    return NextResponse.json({
      ok: true,
      message: "LINE test sent successfully"
    });
  } catch (error) {
    console.error("line-test-send-failed", error);

    return NextResponse.json(
      {
        ok: false,
        error: toReadableError(error)
      },
      { status: 500 }
    );
  } finally {
    console.info("line-test-route-end");
  }
}
