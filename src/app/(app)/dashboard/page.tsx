import Link from "next/link";

import { createSupabaseServer } from "@/lib/supabase/server";
import { getJobTitle, resolveAvailableColumns, resolveJobsTable, type JobRecord } from "@/lib/jobs";

const formatDate = (value: unknown) => {
  if (typeof value !== "string" || !value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
};

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

        {jobs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
            <p className="text-base text-slate-700">ยังไม่มีงานที่สร้างเอกสาร</p>
            <Link
              href="/"
              className="mt-4 inline-flex rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
            >
              สร้างเอกสารใหม่
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {jobs.map((job) => {
              const id = String(job.id ?? "");
              const status = typeof job.status === "string" && job.status.trim() ? job.status : "-";

              return (
                <Link
                  key={id}
                  href={`/dashboard/${id}`}
                  className="block rounded-xl border border-slate-200 bg-white p-4 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  <div className="grid gap-2 sm:grid-cols-3 sm:items-center">
                    <div>
                      <p className="text-xs text-slate-500">ชื่องาน</p>
                      <p className="font-medium text-slate-900">{getJobTitle(job)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">สร้างเมื่อ</p>
                      <p className="text-slate-700">{formatDate(job.created_at)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">สถานะ</p>
                      <p className="text-slate-700">{status}</p>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
