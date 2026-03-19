import { fetchDashboardSummaryOnServer } from "./data";

function SummaryCard({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="rounded-2xl border border-[color:var(--border)] bg-white p-4 shadow-[var(--soft-shadow)]">
      <p className="text-sm text-slate-500">{label}</p>
      <p className={`mt-1 text-3xl font-semibold tracking-tight ${accent}`}>{value}</p>
    </div>
  );
}

export default async function DashboardSummarySection() {
  const startedAt = performance.now();
  console.info("[dashboard-rsc] summary-section-render-start");
  try {
    const { summary } = await fetchDashboardSummaryOnServer("summary-section");

    return (
      <div className="mb-6 grid gap-3 sm:grid-cols-5">
        <SummaryCard label="ทั้งหมด" value={summary.activeCount} accent="text-violet-700" />
        <SummaryCard label="รอตรวจเบื้องต้น" value={summary.precheckPendingCount} accent="text-amber-700" />
        <SummaryCard label="รอตรวจ" value={summary.pendingReviewCount} accent="text-orange-700" />
        <SummaryCard label="รอการแก้ไข" value={summary.needsFixCount} accent="text-rose-700" />
        <SummaryCard label="เสร็จแล้ว" value={summary.completedCount} accent="text-sky-700" />
      </div>
    );
  } finally {
    console.info(`[dashboard-rsc] summary-section-render-end duration=${(performance.now() - startedAt).toFixed(3)}ms`);
  }
}

export function DashboardSummarySectionFallback() {
  return (
    <div className="mb-6 grid gap-3 sm:grid-cols-5">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="rounded-2xl border border-[color:var(--border)] bg-white p-4 shadow-[var(--soft-shadow)]">
          <div className="skeleton-shimmer h-4 w-20 rounded" />
          <div className="mt-2 skeleton-shimmer h-8 w-12 rounded" />
        </div>
      ))}
    </div>
  );
}
