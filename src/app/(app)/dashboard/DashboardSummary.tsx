import { cookies, headers } from "next/headers";

import type { JobRecord } from "@/lib/jobs";
import DashboardJobList from "./DashboardJobList";

type DashboardOverviewResponse = {
  summary: {
    total: number;
    pending: number;
    precheckPending?: number;
    approved: number;
    rejected: number;
    completed: number;
  };
  jobs: JobRecord[];
  hasUserIdColumn: boolean;
  currentUserId: string | null;
};

const getBaseUrl = async () => {
  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host");
  const protocol = headerStore.get("x-forwarded-proto") ?? "http";

  if (!host) {
    return "http://localhost:3000";
  }

  return `${protocol}://${host}`;
};

const fetchOverviewOnServer = async (): Promise<DashboardOverviewResponse> => {
  const [baseUrl, cookieStore] = await Promise.all([getBaseUrl(), cookies()]);
  const response = await fetch(`${baseUrl}/api/dashboard/overview`, {
    method: "GET",
    cache: "no-store",
    headers: {
      cookie: cookieStore.toString()
    }
  });

  const payload = (await response.json()) as DashboardOverviewResponse | { message?: string };

  if (!response.ok) {
    const message = "message" in payload && payload.message ? payload.message : "โหลดข้อมูล dashboard ไม่สำเร็จ";
    throw new Error(message);
  }

  return payload as DashboardOverviewResponse;
};

export default async function DashboardSummary() {
  try {
    const overviewData = await fetchOverviewOnServer();

    return (
      <DashboardJobList
        jobs={overviewData.jobs}
        initialCounts={{
          activeCount: Math.max(overviewData.summary.total - overviewData.summary.completed, 0),
          pendingReviewCount: overviewData.summary.pending,
          precheckPendingCount: overviewData.summary.precheckPending ?? 0,
          needsFixCount: overviewData.summary.rejected,
          completedCount: overviewData.summary.completed
        }}
        isInitialJobsLoading={false}
        hasUserIdColumn={overviewData.hasUserIdColumn}
        currentUserId={overviewData.currentUserId}
      />
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ";

    return (
      <div className="rounded-2xl border border-red-200 bg-red-50/95 p-6 text-red-700 shadow-sm backdrop-blur">
        ไม่สามารถโหลดข้อมูลงานเอกสารได้: {errorMessage}
      </div>
    );
  }
}
