import { cookies, headers } from "next/headers";

import type { JobRecord } from "@/lib/jobs";

export type DashboardSummaryResponse = {
  summary: {
    activeCount: number;
    pendingReviewCount: number;
    precheckPendingCount: number;
    needsFixCount: number;
    completedCount: number;
  };
  hasUserIdColumn: boolean;
  currentUserId: string | null;
};

export type DashboardJobsResponse = {
  jobs: JobRecord[];
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

const fetchDashboardApi = async <T extends object>(path: string): Promise<T> => {
  const [baseUrl, cookieStore] = await Promise.all([getBaseUrl(), cookies()]);
  const response = await fetch(`${baseUrl}${path}`, {
    method: "GET",
    cache: "no-store",
    headers: {
      cookie: cookieStore.toString()
    }
  });

  const payload = (await response.json()) as T | { message?: string };

  if (!response.ok) {
    const message = "message" in payload && payload.message ? payload.message : "โหลดข้อมูล dashboard ไม่สำเร็จ";
    throw new Error(message);
  }

  return payload as T;
};

export const fetchDashboardSummaryOnServer = async (): Promise<DashboardSummaryResponse> =>
  fetchDashboardApi<DashboardSummaryResponse>("/api/dashboard/summary");

export const fetchDashboardJobsOnServer = async (): Promise<DashboardJobsResponse> =>
  fetchDashboardApi<DashboardJobsResponse>("/api/dashboard/jobs");
