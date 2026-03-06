"use client";

import { useEffect, useState } from "react";

import type { JobRecord } from "@/lib/jobs";
import DashboardJobList from "./DashboardJobList";

type DashboardSummaryResponse = {
  summary: {
    activeCount: number;
    pendingReviewCount: number;
    needsFixCount: number;
    completedCount: number;
  };
  hasUserIdColumn: boolean;
  currentUserId: string | null;
};

type DashboardJobsResponse = {
  jobs: JobRecord[];
};

let summaryRequest: Promise<DashboardSummaryResponse> | null = null;
let summaryCache: DashboardSummaryResponse | null = null;

let jobsRequest: Promise<DashboardJobsResponse> | null = null;
let jobsCache: DashboardJobsResponse | null = null;

const fetchJson = async <T extends object>(url: string): Promise<T> => {
  const response = await fetch(url, { method: "GET", cache: "no-store" });
  const payload = (await response.json()) as T | { message?: string };

  if (!response.ok) {
    const message = "message" in payload && payload.message ? payload.message : "โหลดข้อมูล dashboard ไม่สำเร็จ";
    throw new Error(message);
  }

  return payload as T;
};

const fetchSummaryDeduped = async () => {
  if (summaryCache) {
    return summaryCache;
  }

  if (!summaryRequest) {
    summaryRequest = fetchJson<DashboardSummaryResponse>("/api/dashboard/summary")
      .then((payload) => {
        summaryCache = payload;
        return payload;
      })
      .finally(() => {
        summaryRequest = null;
      });
  }

  return summaryRequest;
};

const fetchJobsDeduped = async () => {
  if (jobsCache) {
    return jobsCache;
  }

  if (!jobsRequest) {
    jobsRequest = fetchJson<DashboardJobsResponse>("/api/dashboard/jobs")
      .then((payload) => {
        jobsCache = payload;
        return payload;
      })
      .finally(() => {
        jobsRequest = null;
      });
  }

  return jobsRequest;
};

export default function DashboardSummary() {
  const [summaryData, setSummaryData] = useState<DashboardSummaryResponse | null>(summaryCache);
  const [jobsData, setJobsData] = useState<DashboardJobsResponse | null>(jobsCache);
  const [isJobsLoading, setIsJobsLoading] = useState(!jobsCache);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;

    async function loadSummary() {
      try {
        const payload = await fetchSummaryDeduped();

        if (!isCancelled) {
          setSummaryData(payload);
        }
      } catch (err) {
        if (!isCancelled) {
          setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ");
        }
      }
    }

    async function loadJobs() {
      setIsJobsLoading(true);
      try {
        const payload = await fetchJobsDeduped();
        if (!isCancelled) {
          setJobsData(payload);
        }
      } catch (err) {
        if (!isCancelled) {
          setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ");
        }
      } finally {
        if (!isCancelled) {
          setIsJobsLoading(false);
        }
      }
    }

    void loadSummary();
    void loadJobs();

    return () => {
      isCancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50/95 p-6 text-red-700 shadow-sm backdrop-blur">
        ไม่สามารถโหลดข้อมูลงานเอกสารได้: {error}
      </div>
    );
  }

  if (!summaryData) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="h-28 rounded-2xl border border-slate-100 bg-slate-100/80" />
          <div className="h-28 rounded-2xl border border-slate-100 bg-slate-100/80" />
          <div className="h-28 rounded-2xl border border-slate-100 bg-slate-100/80" />
        </div>
        <div className="h-64 rounded-2xl border border-slate-100 bg-slate-100/80" />
      </div>
    );
  }

  return (
    <DashboardJobList
      jobs={jobsData?.jobs ?? []}
      initialCounts={summaryData.summary}
      isInitialJobsLoading={isJobsLoading}
      hasUserIdColumn={summaryData.hasUserIdColumn}
      currentUserId={summaryData.currentUserId}
    />
  );
}
