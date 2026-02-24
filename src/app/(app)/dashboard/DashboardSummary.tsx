"use client";

import { useEffect, useState } from "react";

import type { JobRecord } from "@/lib/jobs";
import DashboardJobList from "./DashboardJobList";

type DashboardSummaryResponse = {
  jobs: JobRecord[];
  summary: {
    completedCount: number;
  };
  table: string;
  hasUserIdColumn: boolean;
  currentUserId: string | null;
};

export default function DashboardSummary() {
  const [data, setData] = useState<DashboardSummaryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;

    async function load() {
      try {
        const response = await fetch("/api/dashboard/summary", {
          method: "GET",
          cache: "no-store"
        });

        const payload = (await response.json()) as DashboardSummaryResponse | { message?: string };

        if (!response.ok) {
          const message = "message" in payload && payload.message ? payload.message : "โหลดข้อมูลงานเอกสารไม่สำเร็จ";
          throw new Error(message);
        }

        if (!isCancelled) {
          setData(payload as DashboardSummaryResponse);
        }
      } catch (err) {
        if (!isCancelled) {
          setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ");
        }
      }
    }

    void load();

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

  if (!data) {
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
      jobs={data.jobs}
      initialCompletedCount={data.summary.completedCount}
      table={data.table}
      hasUserIdColumn={data.hasUserIdColumn}
      currentUserId={data.currentUserId}
    />
  );
}
