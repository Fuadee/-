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
      <section className="min-h-[calc(100vh-4rem)] bg-gradient-to-br from-slate-50 via-purple-50 to-slate-100 px-4 py-10 sm:px-6">
        <div className="mx-auto max-w-5xl">
          <div className="rounded-2xl border border-red-200 bg-red-50/95 p-6 text-red-700 shadow-sm backdrop-blur">
            ไม่พบตารางงานเอกสารที่รองรับในฐานข้อมูล
          </div>
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
      <section className="min-h-[calc(100vh-4rem)] bg-gradient-to-br from-slate-50 via-purple-50 to-slate-100 px-4 py-10 sm:px-6">
        <div className="mx-auto max-w-5xl">
          <div className="rounded-2xl border border-red-200 bg-red-50/95 p-6 text-red-700 shadow-sm backdrop-blur">
            ไม่สามารถโหลดข้อมูลงานเอกสารได้: {error.message}
          </div>
        </div>
      </section>
    );
  }

  const jobs = (data ?? []) as JobRecord[];

  return (
    <section className="relative min-h-[calc(100vh-4rem)] overflow-hidden bg-gradient-to-br from-slate-50 via-purple-50 to-slate-100 px-4 py-10 sm:px-6">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-16 h-64 w-64 -translate-x-1/2 rounded-full bg-purple-300/20 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-5xl rounded-2xl border border-white/60 bg-white/70 p-6 shadow-md backdrop-blur sm:p-8">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-slate-900">Dashboard</h1>
            <p className="mt-2 text-sm text-slate-600">ภาพรวมงานเอกสารล่าสุดและสถานะการดำเนินการ</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/"
              className="rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:brightness-110"
            >
              ไปหน้า Generate
            </Link>
            <Link
              href="/dashboard"
              className="rounded-xl border border-purple-100 bg-white/70 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-white"
            >
              รีเฟรช
            </Link>
          </div>
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
