import { NextRequest, NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    title?: string;
    department?: string;
    form_data?: Record<string, unknown>;
  };

  const { data, error } = await supabase
    .from("procure_cases")
    .insert({
      title: body.title?.trim() || "",
      department: body.department?.trim() || "",
      form_data: body.form_data ?? {},
      created_by: user.id
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 400 });
  }

  return NextResponse.json({ id: data.id });
}
