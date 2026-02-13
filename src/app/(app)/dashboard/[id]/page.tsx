import Link from "next/link";
import { notFound } from "next/navigation";

import { createSupabaseServer } from "@/lib/supabase/server";
import { getJobFileUrl, getJobTitle, resolveAvailableColumns, resolveJobsTable, type JobRecord } from "@/lib/jobs";

const formatDate = (value: unknown) => {
  if (typeof value !== "string" || !value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "full",
    timeStyle: "short"
  }).format(date);
};

const renderField = (label: string, value: unknown) => (
  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
    <p className="text-xs text-slate-500">{label}</p>
    <p className="mt-1 text-slate-900">{typeof value === "string" && value.trim() ? value : "-"}</p>
  </div>
);

export default async function DashboardDetailPage({ params }: { params: { id: string } }) {
  const supabase = createSupabaseServer();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  const table = await resolveJobsTable(supabase);
  if (!table) {
    notFound();
  }

  const availableColumns = await resolveAvailableColumns(supabase, table);

  let query = supabase.from(table).select("*").eq("id", params.id).limit(1);
  if (user && availableColumns.has("user_id")) {
    query = query.eq("user_id", user.id);
  }

  const { data, error } = await query;
  if (error) {
    return (
      <section className="mx-auto max-w-4xl px-4 py-8">
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-700">
          ไม่สามารถโหลดรายละเอียดงานได้: {error.message}
        </div>
      </section>
    );
  }

  const job = ((data ?? [])[0] ?? null) as JobRecord | null;
  if (!job) {
    notFound();
  }

  const fileUrl = getJobFileUrl(job);

  return (
    <section className="mx-auto max-w-4xl px-4 py-8">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-6 flex items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold text-slate-900">{getJobTitle(job)}</h1>
          <Link href="/dashboard" className="text-sm font-medium text-slate-600 hover:text-slate-900">
            ← กลับไป Dashboard
          </Link>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {renderField("สถานะ", job.status)}
          {renderField("สร้างเมื่อ", formatDate(job.created_at))}
          {availableColumns.has("department") && renderField("แผนก", job.department)}
          {availableColumns.has("subject") && renderField("เรื่อง", job.subject)}
          {availableColumns.has("user_id") && renderField("ผู้ใช้งาน", job.user_id)}
        </div>

        {fileUrl ? (
          <div className="mt-6 rounded-xl border border-indigo-100 bg-indigo-50 p-4">
            <p className="text-sm text-indigo-900">ไฟล์เอกสารที่สร้างแล้ว</p>
            <a
              href={fileUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex rounded-full bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
            >
              เปิด/ดาวน์โหลดไฟล์
            </a>
          </div>
        ) : null}
      </div>
    </section>
  );
}
