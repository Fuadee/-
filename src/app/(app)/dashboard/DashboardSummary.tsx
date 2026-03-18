"use client";

import { useEffect, useState } from "react";

import type { JobRecord } from "@/lib/jobs";
import DashboardJobList from "./DashboardJobList";

type DashboardOverviewResponse = {
  summary: {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
    completed: number;
  };
  jobs: JobRecord[];
  hasUserIdColumn: boolean;
  currentUserId: string | null;
};

const normalizeDashboardStatus = (value: unknown): string => {
  if (typeof value !== "string") {
    return "pending";
  }

  const trimmed = value.trim();
  if (trimmed === "pending_review" || trimmed === "review_pending" || trimmed === "รอตรวจสอบ" || trimmed === "รอตรวจ") {
    return "review_pending";
  }
  if (trimmed === "needs_fix" || trimmed === "revision_requested" || trimmed === "รอการแก้ไข" || trimmed === "รอแก้ไข") {
    return "revision_requested";
  }
  if (trimmed === "pending_approval" || trimmed === "รออนุมัติ") {
    return "pending";
  }

  return trimmed;
};

let overviewRequest: Promise<DashboardOverviewResponse> | null = null;
let overviewCache: DashboardOverviewResponse | null = null;

const fetchJson = async <T extends object>(url: string): Promise<T> => {
  const response = await fetch(url, { method: "GET", cache: "no-store" });
  const payload = (await response.json()) as T | { message?: string };

  if (!response.ok) {
    const message = "message" in payload && payload.message ? payload.message : "โหลดข้อมูล dashboard ไม่สำเร็จ";
    throw new Error(message);
  }

  return payload as T;
};

const fetchOverviewDeduped = async () => {
  if (overviewCache) {
    return overviewCache;
  }

  if (!overviewRequest) {
    overviewRequest = fetchJson<DashboardOverviewResponse>("/api/dashboard/overview")
      .then((payload) => {
        overviewCache = payload;
        return payload;
      })
      .finally(() => {
        overviewRequest = null;
      });
  }

  return overviewRequest;
};

export default function DashboardSummary() {
  const [overviewData, setOverviewData] = useState<DashboardOverviewResponse | null>(overviewCache);
  const [isLoading, setIsLoading] = useState(!overviewCache);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;

    async function loadOverview() {
      setIsLoading(true);
      try {
        const payload = await fetchOverviewDeduped();

        if (!isCancelled) {
          setOverviewData(payload);
        }
      } catch (err) {
        if (!isCancelled) {
          setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ");
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadOverview();

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

  if (!overviewData) {
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
      jobs={overviewData.jobs}
      initialCounts={{
        activeCount: Math.max(overviewData.summary.total - overviewData.summary.completed, 0),
        pendingReviewCount: overviewData.jobs.filter((job) => normalizeDashboardStatus(job.status) === "review_pending").length,
        needsFixCount: overviewData.jobs.filter((job) => normalizeDashboardStatus(job.status) === "revision_requested").length,
        completedCount: overviewData.summary.completed
      }}
      isInitialJobsLoading={isLoading}
      hasUserIdColumn={overviewData.hasUserIdColumn}
      currentUserId={overviewData.currentUserId}
    />
  );
}
