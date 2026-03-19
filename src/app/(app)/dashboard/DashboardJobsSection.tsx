import DashboardJobList from "./DashboardJobList";
import { fetchDashboardJobsOnServer } from "./data";

export default async function DashboardJobsSection() {
  const shouldLogPerf = process.env.NODE_ENV === "development";
  const startedAt = performance.now();
  if (shouldLogPerf) {
    console.info("[dashboard-perf] jobs-section-render-start");
  }
  try {
    const jobsFetchStartedAt = performance.now();
    if (shouldLogPerf) {
      console.info("[dashboard-perf] jobs-section-fetch-start");
    }
    const jobsData = await fetchDashboardJobsOnServer("jobs-section");
    if (shouldLogPerf) {
      console.info(
        `[dashboard-perf] jobs-section-fetch-end duration=${(performance.now() - jobsFetchStartedAt).toFixed(3)}ms jobs=${jobsData.jobs.length}`
      );
    }

    return (
      <DashboardJobList
        jobs={jobsData.jobs}
        hasUserIdColumn={jobsData.hasUserIdColumn}
        currentUserId={jobsData.currentUserId}
        initialCompletedCount={0}
        hasMoreInitialJobs={jobsData.isPartial}
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
    if (shouldLogPerf) {
      console.info(`[dashboard-perf] jobs-section-render-end duration=${(performance.now() - startedAt).toFixed(3)}ms`);
    }
  }
}

export function DashboardJobsSectionFallback() {
  return (
    <div className="mt-2 overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-[var(--soft-shadow)]">
      <div className="grid gap-3 border-b border-[color:var(--border)] bg-white px-5 py-4 sm:hidden">
        {Array.from({ length: 2 }).map((_, index) => (
          <div key={index} className="rounded-2xl border border-slate-100 p-4">
            <div className="skeleton-shimmer h-3 w-20 rounded-full" />
            <div className="mt-3 space-y-2">
              <div className="skeleton-shimmer h-4 w-4/5 rounded" />
              <div className="skeleton-shimmer h-3 w-1/2 rounded" />
              <div className="skeleton-shimmer h-8 w-28 rounded-full" />
            </div>
          </div>
        ))}
      </div>
      <div className="hidden grid-cols-12 gap-3 border-b border-gray-100 bg-white px-6 py-3 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500 sm:grid">
        <p className="col-span-5">ชื่องาน</p>
        <p className="col-span-3">สร้างเมื่อ</p>
        <p className="col-span-2">สถานะ</p>
        <p className="col-span-2 text-right">การทำงาน</p>
      </div>
      <div className="hidden sm:block">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="grid gap-4 border-b border-gray-100 px-5 py-4 sm:grid-cols-12 sm:items-center sm:px-6">
            <div className="space-y-2 sm:col-span-5">
              <div className="skeleton-shimmer h-4 w-5/6 rounded" />
              <div className="skeleton-shimmer h-3 w-1/3 rounded" />
            </div>
            <div className="skeleton-shimmer h-4 w-4/5 rounded sm:col-span-3" />
            <div className="skeleton-shimmer h-8 w-28 rounded-full sm:col-span-2" />
            <div className="flex justify-end sm:col-span-2">
              <div className="skeleton-shimmer h-8 w-24 rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
