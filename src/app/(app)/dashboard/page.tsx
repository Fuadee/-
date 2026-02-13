import Link from "next/link";

import DashboardJobList from "./DashboardJobList";
import { createSupabaseServer } from "@/lib/supabase/server";
import { resolveAvailableColumns, resolveJobsTable, type JobRecord } from "@/lib/jobs";

export default async function DashboardPage() {
  const supabase = createSupabaseServer();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  const table = await resolveJobsTable(supabase);

  if (!table) {
    return (
      <section className="mx-auto max-w-4xl px-4 py-8">
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-700">
          ไม่พบตารางงานเอกสารที่รองรับในฐานข้อมูล
        </div>
      </section>
    );
  }

  const availableColumns = await resolveAvailableColumns(supabase, table);
  let query = supabase.from(table).select("*").order("created_at", { ascending: false }).limit(20);

  if (user && availableColumns.has("user_id")) {
    query = query.eq("user_id", user.id);
  }

  const { data, error } = await query;

  if (error) {
    return (
      <section className="mx-auto max-w-4xl px-4 py-8">
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-700">
          ไม่สามารถโหลดข้อมูลงานเอกสารได้: {error.message}
        </div>
      </section>
    );
  }

  const jobs = (data ?? []) as JobRecord[];

  return (
    <section className="mx-auto max-w-4xl px-4 py-8">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-6 flex items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
          <Link
            href="/"
            className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
          >
            ไปหน้า Generate
          </Link>
        </div>

        <DashboardJobList
          jobs={jobs}
          table={table}
          hasUserIdColumn={availableColumns.has("user_id")}
          currentUserId={user?.id ?? null}
        />
      </div>
    </section>
  );
}
