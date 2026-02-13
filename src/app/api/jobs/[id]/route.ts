import { NextRequest, NextResponse } from "next/server";

import { resolveAvailableColumns, resolveJobsTable, type JobRecord } from "@/lib/jobs";
import { createSupabaseServer } from "@/lib/supabase/server";

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServer();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  const table = await resolveJobsTable(supabase);
  if (!table) {
    return NextResponse.json({ message: "ไม่พบตารางงานเอกสารที่รองรับในฐานข้อมูล" }, { status: 500 });
  }

  const availableColumns = await resolveAvailableColumns(supabase, table);
  let query = supabase.from(table).select("*").eq("id", params.id).limit(1);

  if (user && availableColumns.has("user_id")) {
    query = query.eq("user_id", user.id);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ message: `ไม่สามารถโหลดงานเอกสารได้: ${error.message}` }, { status: 500 });
  }

  const job = ((data ?? [])[0] ?? null) as JobRecord | null;
  if (!job) {
    return NextResponse.json({ message: "ไม่พบงานเอกสาร หรือไม่มีสิทธิ์เข้าถึง" }, { status: 404 });
  }

  return NextResponse.json({ job });
}
