import Link from "next/link";

import DashboardSummary from "./DashboardSummary";

export default function DashboardPage() {
  return (
    <section className="relative min-h-[calc(100vh-4rem)] overflow-hidden bg-[var(--bg)] px-4 py-8 sm:px-6 sm:py-10">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-20 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-purple-300/15 blur-3xl" />
        <div className="absolute right-0 top-32 h-56 w-56 rounded-full bg-fuchsia-200/20 blur-3xl" />
      </div>

      <div className="relative mx-auto w-full max-w-6xl rounded-3xl border border-[color:var(--border)] bg-white/75 p-5 shadow-[var(--soft-shadow)] backdrop-blur-xl sm:p-8">
        <div className="mb-8 flex flex-col gap-4 border-b border-[color:var(--border)] pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <span className="mb-3 inline-flex rounded-full border border-purple-100 bg-purple-50 px-3 py-1 text-xs font-medium uppercase tracking-[0.12em] text-purple-700">
              Latest jobs
            </span>
            <h1 className="text-4xl font-semibold tracking-[-0.02em] text-slate-900">Dashboard</h1>
            <p className="mt-2 text-sm text-slate-500">ภาพรวมงานเอกสารล่าสุดและสถานะการดำเนินการ</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/"
              className="focus-ring inline-flex items-center rounded-xl bg-[image:var(--accent-glow)] px-4 py-2 text-sm font-semibold text-white shadow-[0_10px_26px_rgba(147,51,234,0.34)] transition hover:brightness-105 active:translate-y-px"
            >
              ไปหน้า Generate
            </Link>
            <Link
              href="/dashboard"
              className="focus-ring rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              รีเฟรช
            </Link>
          </div>
        </div>

        <DashboardSummary />
      </div>
    </section>
  );
}
