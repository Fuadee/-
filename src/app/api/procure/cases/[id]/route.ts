import { NextRequest, NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = (await request.json()) as {
    title?: string;
    department?: string;
    form_data?: Record<string, unknown>;
  };

  const { error } = await supabase
    .from("procure_cases")
    .update({
      title: body.title,
      department: body.department,
      form_data: body.form_data ?? {}
    })
    .eq("id", id)
    .eq("created_by", user.id);

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
