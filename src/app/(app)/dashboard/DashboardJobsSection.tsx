import DashboardJobList from "./DashboardJobList";
import { fetchDashboardJobsOnServer, fetchDashboardSummaryOnServer } from "./data";

export default async function DashboardJobsSection() {
  const startedAt = performance.now();
  console.info("[dashboard-rsc] jobs-section-render-start");
  try {
    const [jobsData, summaryData] = await Promise.all([
      fetchDashboardJobsOnServer("jobs-section"),
      fetchDashboardSummaryOnServer("jobs-section")
    ]);

    return (
      <DashboardJobList
        jobs={jobsData.jobs}
        hasUserIdColumn={summaryData.hasUserIdColumn}
        currentUserId={summaryData.currentUserId}
        initialCompletedCount={summaryData.summary.completedCount}
      />
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ";

    return (
      <div className="rounded-2xl border border-red-200 bg-red-50/95 p-6 text-red-700 shadow-sm backdrop-blur">
        ไม่สามารถโหลดข้อมูลงานเอกสารได้: {errorMessage}
      </div>
    );
  } finally {
    console.info(`[dashboard-rsc] jobs-section-render-end duration=${(performance.now() - startedAt).toFixed(3)}ms`);
  }
}

export function DashboardJobsSectionFallback() {
  return (
    <div className="overflow-hidden rounded-3xl border border-[color:var(--border)] bg-white shadow-[var(--soft-shadow)]">
      <div className="hidden grid-cols-12 gap-3 border-b border-[color:var(--border)] bg-purple-50/60 px-6 py-3 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500 sm:grid">
        <p className="col-span-5">ชื่องาน</p>
        <p className="col-span-3">สร้างเมื่อ</p>
        <p className="col-span-2">สถานะ</p>
        <p className="col-span-2 text-right">การทำงาน</p>
      </div>
      <div className="divide-y divide-slate-100">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="grid animate-pulse gap-4 px-5 py-4 sm:grid-cols-12 sm:items-center sm:px-6">
            <div className="h-4 rounded bg-slate-100 sm:col-span-5" />
            <div className="h-4 rounded bg-slate-100 sm:col-span-3" />
            <div className="h-4 rounded bg-slate-100 sm:col-span-2" />
            <div className="h-4 rounded bg-slate-100 sm:col-span-2" />
          </div>
        ))}
      </div>
    </div>
  );
}
