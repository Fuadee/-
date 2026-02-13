import { NextRequest, NextResponse } from "next/server";

import { type ProcureStatus } from "@/lib/procure";
import { resolveTransition, type TransitionAction } from "@/lib/procureTransitions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(
  request: NextRequest,
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

  const body = (await request.json()) as { action?: TransitionAction; note?: string };

  if (!body.action) {
    return NextResponse.json({ message: "action is required" }, { status: 400 });
  }

  const { data: procurementCase, error: caseError } = await supabase
    .from("procure_cases")
    .select("id,status")
    .eq("id", id)
    .eq("created_by", user.id)
    .single();

  if (caseError || !procurementCase) {
    return NextResponse.json({ message: caseError?.message ?? "Case not found" }, { status: 404 });
  }

  const fromStatus = procurementCase.status as ProcureStatus;
  const toStatus = resolveTransition(fromStatus, body.action);

  if (!toStatus) {
    return NextResponse.json({ message: "Transition not allowed" }, { status: 400 });
  }

  const { error: updateError } = await supabase
    .from("procure_cases")
    .update({ status: toStatus })
    .eq("id", id)
    .eq("created_by", user.id);

  if (updateError) {
    return NextResponse.json({ message: updateError.message }, { status: 400 });
  }

  const { error: eventError } = await supabase.from("procure_case_events").insert({
    case_id: id,
    from_status: fromStatus,
    to_status: toStatus,
    action: body.action,
    note: body.note ?? null,
    created_by: user.id
  });

  if (eventError) {
    return NextResponse.json({ message: eventError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, from_status: fromStatus, to_status: toStatus });
}
