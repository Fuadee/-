"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { getJobTitle, type JobRecord } from "@/lib/jobs";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import StatusActionDialog, { type EffectiveStatus } from "./StatusActionDialog";

type DashboardJobListProps = {
  jobs: JobRecord[];
  table: string;
  hasUserIdColumn: boolean;
  currentUserId: string | null;
};

type DashboardJobItem = JobRecord & {
  id: string;
  status: EffectiveStatus;
};

type DialogState = {
  id: string;
  title: string;
  status: EffectiveStatus;
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

const normalizeStatus = (value: unknown): EffectiveStatus => {
  if (typeof value !== "string") {
    return "pending_approval";
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed === "generated") {
    return "pending_approval";
  }

  if (trimmed === "pending_review" || trimmed === "awaiting_payment" || trimmed === "needs_fix" || trimmed === "pending_approval") {
    return trimmed;
  }

  return "pending_approval";
};

const getStatusLabel = (status: EffectiveStatus): string =>
  ({
    pending_approval: "รออนุมัติ",
    pending_review: "รอตรวจ",
    awaiting_payment: "รอเบิกจ่าย",
    needs_fix: "รอการแก้ไข"
  })[status];

export default function DashboardJobList({ jobs, table, hasUserIdColumn, currentUserId }: DashboardJobListProps) {
  const router = useRouter();
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

  const handleStatusClick = (id: string, title: string, status: EffectiveStatus) => {
    setDialog({ id, title, status });
    setErrorMessage(null);
  };

  const handleUpdateStatus = async (nextStatus: EffectiveStatus) => {
    if (!dialog || isSaving || dialog.status === "awaiting_payment") {
      return;
    }

    if (hasUserIdColumn && !currentUserId) {
      setErrorMessage("ไม่พบผู้ใช้งานปัจจุบัน จึงไม่สามารถอัปเดตสถานะได้");
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    let query = supabase.from(table).update({ status: nextStatus }).eq("id", dialog.id);

    if (hasUserIdColumn) {
      query = query.eq("user_id", currentUserId);
    }

    const { error } = await query;

    if (error) {
      setErrorMessage(`อัปเดตสถานะไม่สำเร็จ: ${error.message}`);
      setIsSaving(false);
      return;
    }

    setItems((prev) => prev.map((item) => (item.id === dialog.id ? { ...item, status: nextStatus } : item)));
    setDialog(null);
    setIsSaving(false);
    router.refresh();
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
                    onClick={() => handleStatusClick(id, getJobTitle(job), status)}
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

      {errorMessage ? (
        <div className="fixed right-4 top-4 z-[60] max-w-sm rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow">
          {errorMessage}
        </div>
      ) : null}

      <StatusActionDialog
        open={Boolean(dialog)}
        jobTitle={dialog?.title ?? ""}
        status={dialog?.status ?? "pending_approval"}
        isSaving={isSaving}
        errorMessage={errorMessage}
        onClose={() => setDialog(null)}
        onUpdateStatus={handleUpdateStatus}
      />
    </>
  );
}
