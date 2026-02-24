"use client";

import Link from "next/link";
import { type ReactNode, useMemo, useState } from "react";

import { getJobTitle, type JobRecord } from "@/lib/jobs";
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
  isRemoving?: boolean;
};

type DashboardTab = "active" | "completed";

type DialogState = {
  id: string;
  title: string;
  status: EffectiveStatus;
  detailsText: string;
  vendorName: string;
  taxId: string;
  grandTotal: number | null;
} | null;

type JobPayload = {
  subject_detail?: unknown;
  vendor_name?: unknown;
  tax_id?: unknown;
  items?: unknown;
};

type CompletedJobsResponse = {
  jobs: JobRecord[];
};

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

  if (trimmed === "ดำเนินการแล้วเสร็จ") {
    return "completed";
  }

  if (trimmed === "pending_review" || trimmed === "awaiting_payment" || trimmed === "needs_fix" || trimmed === "pending_approval" || trimmed === "completed") {
    return trimmed;
  }

  return "pending_approval";
};

const isCompletedStatus = (job: Pick<DashboardJobItem, "status">): boolean => {
  const normalized = normalizeStatus(job.status);
  return normalized === "completed";
};

const asTrimmedString = (value: unknown): string => {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
};

const parseJobPayload = (value: unknown): JobPayload => {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return typeof parsed === "object" && parsed !== null ? (parsed as JobPayload) : {};
    } catch {
      return {};
    }
  }

  if (typeof value === "object" && value !== null) {
    return value as JobPayload;
  }

  return {};
};

const getGrandTotal = (itemsValue: unknown): number | null => {
  if (!Array.isArray(itemsValue)) {
    return null;
  }

  const total = itemsValue.reduce((sum, item) => {
    if (typeof item !== "object" || item === null) {
      return sum;
    }

    const current = item as Record<string, unknown>;
    const value = typeof current.total === "number" ? current.total : Number(current.total);
    if (!Number.isFinite(value)) {
      return sum;
    }

    return sum + value;
  }, 0);

  return Number.isFinite(total) ? total : null;
};

const getStatusLabel = (status: EffectiveStatus): string =>
  ({
    pending_approval: "รออนุมัติ",
    pending_review: "รอตรวจ",
    awaiting_payment: "รอเบิกจ่าย",
    needs_fix: "รอการแก้ไข",
    completed: "ดำเนินการแล้วเสร็จ"
  })[status];

const statusClassName: Record<EffectiveStatus, string> = {
  pending_approval: "border-purple-100 bg-purple-50 text-purple-700 hover:bg-purple-100 focus-visible:ring-purple-300",
  pending_review: "border-amber-100 bg-amber-50 text-amber-700 hover:bg-amber-100 focus-visible:ring-amber-300",
  awaiting_payment: "border-emerald-100 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 focus-visible:ring-emerald-300",
  needs_fix: "border-rose-100 bg-rose-50 text-rose-700 hover:bg-rose-100 focus-visible:ring-rose-300",
  completed: "border-sky-100 bg-sky-50 text-sky-700 hover:bg-sky-100 focus-visible:ring-sky-300"
};

type KpiCardProps = {
  label: string;
  value: number;
  accent: string;
  icon: ReactNode;
};

function KpiCard({ label, value, accent, icon }: KpiCardProps) {
  return (
    <div className="group rounded-2xl border border-[color:var(--border)] bg-white p-4 shadow-[var(--soft-shadow)] transition duration-200 hover:-translate-y-1 hover:shadow-[0_12px_30px_rgba(124,58,237,0.15)]">
      <div className={`mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full ${accent} text-white shadow-sm`}>{icon}</div>
      <p className="text-sm text-slate-500">{label}</p>
      <p className="text-3xl font-semibold tracking-tight text-slate-900">{value}</p>
      <div className="mt-3 h-1.5 rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${accent} opacity-60`} style={{ width: value > 0 ? "68%" : "18%" }} />
      </div>
    </div>
  );
}

const toDashboardItem = (job: JobRecord): DashboardJobItem => ({
  ...job,
  id: String(job.id ?? ""),
  status: normalizeStatus(job.status),
  isRemoving: false
});

export default function DashboardJobList({ jobs, hasUserIdColumn, currentUserId }: DashboardJobListProps) {
  const [items, setItems] = useState<DashboardJobItem[]>(jobs.map(toDashboardItem));
  const [completedItemsCache, setCompletedItemsCache] = useState<DashboardJobItem[] | null>(null);
  const [currentTab, setCurrentTab] = useState<DashboardTab>("active");
  const [isCompletedLoading, setIsCompletedLoading] = useState(false);
  const [completedError, setCompletedError] = useState<string | null>(null);

  const [dialog, setDialog] = useState<DialogState>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isPaymentProcessing, setIsPaymentProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [paymentErrorMessage, setPaymentErrorMessage] = useState<string | null>(null);
  const [paymentSuccessMessage, setPaymentSuccessMessage] = useState<string | null>(null);

  const activeItems = useMemo(() => items.filter((item) => !isCompletedStatus(item) && !item.isRemoving), [items]);
  const completedItems = useMemo(() => {
    const base = completedItemsCache ?? [];
    return base.filter((item) => isCompletedStatus(item) && !item.isRemoving);
  }, [completedItemsCache]);

  const totalCount = activeItems.length;
  const pendingReviewCount = activeItems.filter((item) => normalizeStatus(item.status) === "pending_review").length;
  const needsFixCount = activeItems.filter((item) => normalizeStatus(item.status) === "needs_fix").length;

  const fetchCompletedItems = async () => {
    if (completedItemsCache || isCompletedLoading) {
      return;
    }

    setIsCompletedLoading(true);
    setCompletedError(null);

    try {
      const response = await fetch("/api/dashboard/completed", {
        method: "GET",
        cache: "no-store"
      });

      const payload = (await response.json()) as CompletedJobsResponse | { message?: string };

      if (!response.ok) {
        const message = "message" in payload && payload.message ? payload.message : "โหลดงานที่เสร็จแล้วไม่สำเร็จ";
        throw new Error(message);
      }

      setCompletedItemsCache((payload as CompletedJobsResponse).jobs.map(toDashboardItem));
    } catch (err) {
      setCompletedError(err instanceof Error ? err.message : "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ");
    } finally {
      setIsCompletedLoading(false);
    }
  };

  const handleTabChange = (nextTab: DashboardTab) => {
    setCurrentTab(nextTab);

    if (nextTab === "completed") {
      void fetchCompletedItems();
    }
  };

  const markJobCompleted = (jobId: string) => {
    let movedItem: DashboardJobItem | null = null;

    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== jobId) {
          return item;
        }

        movedItem = { ...item, status: "completed", isRemoving: true };
        return movedItem;
      })
    );

    if (movedItem) {
      setCompletedItemsCache((prev) => {
        if (!prev) {
          return [movedItem as DashboardJobItem];
        }

        const withoutDuplicate = prev.filter((item) => item.id !== jobId);
        return [movedItem as DashboardJobItem, ...withoutDuplicate];
      });
    }

    window.setTimeout(() => {
      setItems((prev) => prev.filter((item) => item.id !== jobId));
      setCompletedItemsCache((prev) => (prev ? prev.map((item) => (item.id === jobId ? { ...item, isRemoving: false } : item)) : prev));
    }, 250);
  };

  const handleStatusClick = (job: DashboardJobItem, status: EffectiveStatus) => {
    const id = String(job.id ?? "");
    const title = getJobTitle(job);
    const payload = parseJobPayload(job.payload);

    setDialog({
      id,
      title,
      status,
      detailsText: asTrimmedString(payload.subject_detail),
      vendorName: asTrimmedString(payload.vendor_name),
      taxId: asTrimmedString(payload.tax_id) || asTrimmedString(job.tax_id),
      grandTotal: getGrandTotal(payload.items)
    });
    setErrorMessage(null);
    setPaymentErrorMessage(null);
    setPaymentSuccessMessage(null);
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

    const response = await fetch(`/api/jobs/${encodeURIComponent(dialog.id)}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ status: nextStatus })
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      setErrorMessage(payload?.message ?? "อัปเดตสถานะไม่สำเร็จ");
      setIsSaving(false);
      return;
    }

    if (nextStatus === "completed") {
      markJobCompleted(dialog.id);
    } else {
      setItems((prev) => prev.map((item) => (item.id === dialog.id ? { ...item, status: nextStatus } : item)));
    }

    setDialog(null);
    setIsSaving(false);
  };

  const handleMarkPaymentDone = async () => {
    if (!dialog || isPaymentProcessing || dialog.status !== "awaiting_payment") {
      return;
    }

    if (hasUserIdColumn && !currentUserId) {
      setPaymentErrorMessage("ไม่พบผู้ใช้งานปัจจุบัน จึงไม่สามารถยืนยันการเบิกจ่ายได้");
      return;
    }

    setIsPaymentProcessing(true);
    setPaymentErrorMessage(null);
    setPaymentSuccessMessage(null);

    const response = await fetch(`/api/jobs/${encodeURIComponent(dialog.id)}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ action: "mark_payment_done" })
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      setPaymentErrorMessage(payload?.message ?? "ส่ง LINE ไม่สำเร็จ กรุณาลองใหม่");
      setIsPaymentProcessing(false);
      return;
    }

    markJobCompleted(dialog.id);
    setPaymentSuccessMessage("ส่งแจ้งเตือนแล้ว ✅");

    window.setTimeout(() => {
      setDialog(null);
      setPaymentSuccessMessage(null);
      setIsPaymentProcessing(false);
    }, 800);
  };

  const hasAnyItems = activeItems.length > 0 || completedItems.length > 0 || isCompletedLoading;

  if (!hasAnyItems) {
    return (
      <div className="rounded-3xl border border-dashed border-[color:var(--border)] bg-white/90 p-10 text-center shadow-[var(--soft-shadow)]">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-purple-100 via-fuchsia-100 to-orange-100 text-purple-700">
          <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M8 8h8M8 12h8M8 16h5" strokeLinecap="round" />
            <path d="M6 3h9l3 3v15H6z" strokeLinejoin="round" />
          </svg>
        </div>
        <p className="text-lg font-medium text-slate-800">ยังไม่มีงานที่สร้างเอกสาร</p>
        <p className="mt-1 text-sm text-slate-500">เริ่มต้นสร้างงานแรกของคุณเพื่อให้ Dashboard แสดงผลแบบเต็ม</p>
        <Link
          href="/"
          className="focus-ring mt-6 inline-flex rounded-xl bg-[image:var(--accent-glow)] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_10px_26px_rgba(147,51,234,0.3)] transition hover:brightness-105"
        >
          สร้างงานใหม่
        </Link>
      </div>
    );
  }

  const tableItems = currentTab === "active" ? activeItems : completedItems;

  return (
    <>
      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        <KpiCard
          label="ทั้งหมด"
          value={totalCount}
          accent="bg-gradient-to-br from-violet-500 to-purple-500"
          icon={
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
              <circle cx="12" cy="12" r="8" />
            </svg>
          }
        />
        <KpiCard
          label="รอตรวจ"
          value={pendingReviewCount}
          accent="bg-gradient-to-br from-amber-400 to-orange-400"
          icon={
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
              <path d="M12 3 2 21h20L12 3zm0 6a1 1 0 0 1 1 1v4a1 1 0 1 1-2 0v-4a1 1 0 0 1 1-1zm0 10a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5z" />
            </svg>
          }
        />
        <KpiCard
          label="รอการแก้ไข"
          value={needsFixCount}
          accent="bg-gradient-to-br from-rose-500 to-fuchsia-500"
          icon={
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
              <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm3.54 13.46a1 1 0 0 1-1.42 1.42L12 14.76l-2.12 2.12a1 1 0 0 1-1.42-1.42L10.58 13 8.46 10.88a1 1 0 1 1 1.42-1.42L12 11.58l2.12-2.12a1 1 0 0 1 1.42 1.42L13.42 13z" />
            </svg>
          }
        />
        <KpiCard
          label="เสร็จแล้ว"
          value={completedItems.length}
          accent="bg-gradient-to-br from-sky-500 to-blue-500"
          icon={
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
              <path d="M9.5 16.2 5.8 12.5l1.4-1.4 2.3 2.3 7.3-7.3 1.4 1.4z" />
            </svg>
          }
        />
      </div>

      <div className="mb-4 inline-flex rounded-full border border-slate-200 bg-slate-100/60 p-1 transition duration-200">
        <button
          type="button"
          onClick={() => handleTabChange("active")}
          className={`rounded-full px-4 py-2 text-sm font-semibold transition duration-200 ${
            currentTab === "active"
              ? "bg-gradient-to-r from-purple-500 via-pink-500 to-orange-400 text-white shadow-sm"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          กำลังดำเนินการ ({activeItems.length})
        </button>
        <button
          type="button"
          onClick={() => handleTabChange("completed")}
          className={`rounded-full px-4 py-2 text-sm font-semibold transition duration-200 ${
            currentTab === "completed"
              ? "bg-gradient-to-r from-purple-500 via-pink-500 to-orange-400 text-white shadow-sm"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          งานที่เสร็จแล้ว ({completedItems.length})
        </button>
      </div>

      <div className="overflow-hidden rounded-3xl border border-[color:var(--border)] bg-white shadow-[var(--soft-shadow)]">
        <div className="hidden grid-cols-12 gap-3 border-b border-[color:var(--border)] bg-purple-50/60 px-6 py-3 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500 sm:grid">
          <p className="col-span-5">ชื่องาน</p>
          <p className="col-span-3">สร้างเมื่อ</p>
          <p className="col-span-2">สถานะ</p>
          <p className="col-span-2 text-right">การทำงาน</p>
        </div>

        {isCompletedLoading && currentTab === "completed" ? (
          <div className="divide-y divide-slate-100">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="grid animate-pulse gap-4 px-5 py-4 sm:grid-cols-12 sm:items-center sm:px-6">
                <div className="h-4 rounded bg-slate-100 sm:col-span-5" />
                <div className="h-4 rounded bg-slate-100 sm:col-span-3" />
                <div className="h-4 rounded bg-slate-100 sm:col-span-2" />
                <div className="h-4 rounded bg-slate-100 sm:col-span-2" />
              </div>
            ))}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {tableItems.map((job) => {
              const status = normalizeStatus(job.status);
              const id = String(job.id ?? "");
              const isCompletedTab = currentTab === "completed";

              return (
                <div
                  key={id}
                  className={`group relative grid gap-4 px-5 py-4 transition-all duration-250 ease-out hover:bg-purple-50/50 sm:grid-cols-12 sm:items-center sm:px-6 ${
                    job.isRemoving ? "pointer-events-none translate-y-0.5 opacity-0" : ""
                  }`}
                >
                  <span className="pointer-events-none absolute hidden h-10 w-1 -translate-x-5 rounded-r-full bg-violet-300 opacity-0 transition group-hover:opacity-100 sm:block" />
                  <div className="sm:col-span-5">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-400 sm:hidden">ชื่องาน</p>
                    <p className="font-semibold text-slate-900">{getJobTitle(job)}</p>
                    <p className="text-xs text-slate-500">Job #{id.slice(0, 8)}</p>
                  </div>
                  <div className="sm:col-span-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-400 sm:hidden">สร้างเมื่อ</p>
                    <p className="text-sm text-slate-700">{formatDate(job.created_at)}</p>
                  </div>
                  <div className="sm:col-span-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-400 sm:hidden">สถานะ</p>
                    {isCompletedTab ? (
                      <span className={`inline-flex rounded-full border px-3 py-1 text-sm font-medium ${statusClassName[status]}`}>
                        {getStatusLabel(status)}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleStatusClick(job, status)}
                        className={`focus-ring rounded-full border px-3 py-1 text-sm font-medium transition ${statusClassName[status]}`}
                      >
                        {getStatusLabel(status)}
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center justify-start gap-2 sm:col-span-2 sm:justify-end">
                    <p className="w-full text-xs font-medium uppercase tracking-wide text-slate-400 sm:hidden">การทำงาน</p>
                    {isCompletedTab ? (
                      <>
                        <Link
                          href={`/?job=${encodeURIComponent(id)}`}
                          className="focus-ring rounded-lg px-2 py-1 text-sm font-semibold text-purple-700 underline decoration-purple-300 decoration-2 underline-offset-4 transition hover:text-purple-900"
                        >
                          ดูรายละเอียด
                        </Link>
                        <Link
                          href={`/?job=${encodeURIComponent(id)}`}
                          className="focus-ring rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
                        >
                          แก้ไข (สร้างเวอร์ชันใหม่)
                        </Link>
                      </>
                    ) : (
                      <>
                        <Link
                          href={`/?job=${encodeURIComponent(id)}`}
                          className="focus-ring rounded-lg px-2 py-1 text-sm font-semibold text-purple-700 underline decoration-purple-300 decoration-2 underline-offset-4 transition hover:text-purple-900"
                        >
                          แก้ไขงานนี้ →
                        </Link>
                        <Link
                          href={`/?job=${encodeURIComponent(id)}`}
                          className="focus-ring rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
                        >
                          ดูรายละเอียด
                        </Link>
                      </>
                    )}
                  </div>
                </div>
              );
            })}

            {!isCompletedLoading && tableItems.length === 0 ? (
              <div className="px-6 py-10 text-center text-sm text-slate-500">
                {currentTab === "active" ? "ไม่มีงานที่กำลังดำเนินการ" : "ยังไม่มีงานที่เสร็จแล้ว"}
              </div>
            ) : null}
          </div>
        )}
      </div>

      {completedError ? <div className="mt-3 text-sm text-rose-600">{completedError}</div> : null}

      {errorMessage ? (
        <div className="fixed right-4 top-4 z-[60] max-w-sm rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow">
          {errorMessage}
        </div>
      ) : null}

      <StatusActionDialog
        open={Boolean(dialog)}
        jobTitle={dialog?.title ?? ""}
        status={dialog?.status ?? "pending_approval"}
        detailsText={dialog?.detailsText ?? ""}
        vendorName={dialog?.vendorName ?? ""}
        taxId={dialog?.taxId ?? ""}
        grandTotal={dialog?.grandTotal ?? null}
        isSaving={isSaving}
        isPaymentProcessing={isPaymentProcessing}
        errorMessage={errorMessage}
        paymentErrorMessage={paymentErrorMessage}
        paymentSuccessMessage={paymentSuccessMessage}
        onClose={() => {
          if (isSaving || isPaymentProcessing) {
            return;
          }

          setDialog(null);
          setErrorMessage(null);
          setPaymentErrorMessage(null);
          setPaymentSuccessMessage(null);
        }}
        onUpdateStatus={handleUpdateStatus}
        onMarkPaymentDone={handleMarkPaymentDone}
      />
    </>
  );
}
