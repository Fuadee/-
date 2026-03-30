import { NextRequest, NextResponse } from "next/server";

import { projectionEnabled } from "@/lib/dashboardProjection";
import { createSupabaseServer } from "@/lib/supabase/server";

type RebuildBody = {
  jobId?: string;
  userId?: string;
};

const asTrimmedString = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

const isAuthorized = async (request: NextRequest): Promise<boolean> => {
  const token = asTrimmedString(request.headers.get("x-dashboard-admin-token"));
  const expectedToken = asTrimmedString(process.env.DASHBOARD_ADMIN_TOKEN);

  if (expectedToken && token && token === expectedToken) {
    return true;
  }

  const supabase = createSupabaseServer();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  return Boolean(user);
};

export async function POST(request: NextRequest) {
  if (!projectionEnabled()) {
    return NextResponse.json({ message: "dashboard projection is disabled" }, { status: 400 });
  }

  if (!(await isAuthorized(request))) {
    return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as RebuildBody;
  const jobId = asTrimmedString(body.jobId);
  const userId = asTrimmedString(body.userId);

  const supabase = createSupabaseServer();

  const { data: rebuiltRows, error: rebuildError } = await supabase.rpc("dashboard_backfill_projection", {
    p_job_id: jobId || null
  });

  if (rebuildError) {
    return NextResponse.json({ message: `rebuild failed: ${rebuildError.message}` }, { status: 500 });
  }

  let refreshedUserRows: number | null = null;
  if (userId) {
    const { data, error } = await supabase.rpc("dashboard_refresh_projection_for_user", {
      p_user_id: userId
    });

    if (error) {
      return NextResponse.json({ message: `user refresh failed: ${error.message}` }, { status: 500 });
    }

    refreshedUserRows = typeof data === "number" ? data : null;
  }

  console.info("[dashboard-projection] admin-rebuild-success", {
    mode: jobId ? "single-job" : "full",
    jobId: jobId || null,
    userId: userId || null,
    rebuiltRows: typeof rebuiltRows === "number" ? rebuiltRows : null,
    refreshedUserRows
  });

  return NextResponse.json({
    ok: true,
    mode: jobId ? "single-job" : "full",
    jobId: jobId || null,
    rebuiltRows: typeof rebuiltRows === "number" ? rebuiltRows : null,
    refreshedUserRows
  });
}
