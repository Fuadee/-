"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { getJobTitle, type JobRecord } from "@/lib/jobs";
import { createSupabaseBrowser } from "@/lib/supabase/client";

type DashboardJobListProps = {
  jobs: JobRecord[];
  table: string;
  hasUserIdColumn: boolean;
  currentUserId: string | null;
};

type DashboardJobItem = JobRecord & {
  id: string;
  status: string;
};

type DialogState = {
  id: string;
  title: string;
} | null;

const formatDate = (value: unknown) => {
  if (typeof value !== "string" || !value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
};

const normalizeStatus = (value: unknown): string => {
  if (typeof value !== "string") {
    return "generated";
  }

  const trimmed = value.trim();
  return trimmed || "generated";
};

const getStatusLabel = (status: string): string => {
  if (status === "generated") {
    return "รออนุมัติ";
  }

  if (status === "pending_review") {
    return "รอตรวจ";
  }

  return status;
};

export default function DashboardJobList({ jobs, table, hasUserIdColumn, currentUserId }: DashboardJobListProps) {
  const supabase = useMemo(() => createSupabaseBrowser(), []);

  const [items, setItems] = useState<DashboardJobItem[]>(
    jobs.map((job) => ({
      ...job,
      id: String(job.id ?? ""),
      status: normalizeStatus(job.status)
    }))
  );
  const [dialog, setDialog] = useState<DialogState>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleStatusClick = (id: string, title: string) => {
    setDialog({ id, title });
    setErrorMessage(null);
  };

  const handleConfirmUpdated = async () => {
    if (!dialog || isSaving) {
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    let query = supabase.from(table).update({ status: "pending_review" }).eq("id", dialog.id);

    if (hasUserIdColumn && currentUserId) {
      query = query.eq("user_id", currentUserId);
    }

    const { error } = await query;

    if (error) {
      setErrorMessage(`อัปเดตสถานะไม่สำเร็จ: ${error.message}`);
      setIsSaving(false);
      return;
    }

    setItems((prev) => prev.map((item) => (item.id === dialog.id ? { ...item, status: "pending_review" } : item)));
    setDialog(null);
    setIsSaving(false);
  };

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
        <p className="text-base text-slate-700">ยังไม่มีงานที่สร้างเอกสาร</p>
        <Link
          href="/"
          className="mt-4 inline-flex rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
        >
          สร้างเอกสารใหม่
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {items.map((job) => {
          const status = normalizeStatus(job.status);
          const id = String(job.id ?? "");

          return (
            <div key={id} className="rounded-xl border border-slate-200 bg-white p-4 transition hover:border-slate-300 hover:bg-slate-50">
              <div className="grid gap-2 sm:grid-cols-3 sm:items-center">
                <div>
                  <p className="text-xs text-slate-500">ชื่องาน</p>
                  <p className="font-medium text-slate-900">{getJobTitle(job)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">สร้างเมื่อ</p>
                  <p className="text-slate-700">{formatDate(job.created_at)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">สถานะ</p>
                  <button
                    type="button"
                    onClick={() => handleStatusClick(id, getJobTitle(job))}
                    className="rounded-full border border-slate-300 bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                  >
                    {getStatusLabel(status)}
                  </button>
                </div>
              </div>
              <Link href={`/?job=${encodeURIComponent(id)}`} className="mt-2 inline-block text-xs font-medium text-slate-500 hover:text-slate-700">
                แก้ไขงานนี้ →
              </Link>
            </div>
          );
        })}
      </div>

      {dialog ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-slate-900">อัปเดตสถานะงาน</h2>
            <p className="mt-2 text-sm text-slate-600">{dialog.title}</p>
            <p className="mt-4 text-sm text-slate-700">
              เข้าไปที่{" "}
              <a
                href="https://eprocurement.pea.co.th/"
                target="_blank"
                rel="noreferrer"
                className="font-medium text-blue-600 underline underline-offset-2"
              >
                https://eprocurement.pea.co.th/
              </a>{" "}
              เพื่อลงข้อมูล
            </p>

            {errorMessage ? (
              <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage}</p>
            ) : null}

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDialog(null)}
                disabled={isSaving}
                className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                ยังไม่ลง
              </button>
              <button
                type="button"
                onClick={handleConfirmUpdated}
                disabled={isSaving}
                className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSaving ? "กำลังบันทึก..." : "ลงแล้ว"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
