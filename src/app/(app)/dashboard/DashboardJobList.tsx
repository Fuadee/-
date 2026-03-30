"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { getJobTitle, type JobRecord } from "@/lib/jobs";
import { getEProcurementCardData } from "@/lib/eProcurementFields";
import { type EffectiveStatus } from "./StatusActionDialog";

type DashboardJobListProps = {
  jobs: JobRecord[];
  hasUserIdColumn: boolean;
  currentUserId: string | null;
  initialCompletedCount: number;
  hasMoreInitialJobs: boolean;
};

type DashboardJobItem = JobRecord & {
  id: string;
  status: EffectiveStatus;
  isRemoving?: boolean;
};

type DashboardTab = "active" | "completed";
type ActiveFilter = "all" | "main_flow" | "precheck";

type DialogState = {
  id: string;
  title: string;
  status: EffectiveStatus;
  returnFromStatus: string;
  detailsText: string;
  vendorName: string;
  taxId: string;
  grandTotal: number | null;
} | null;

type NeedsFixDialogState = {
  id: string;
  title: string;
} | null;

type JobPayload = Record<string, unknown> & {
  subject_detail?: unknown;
  vendor_name?: unknown;
  tax_id?: unknown;
  items?: unknown;
  subtotal?: unknown;
  vat_amount?: unknown;
  vat_rate?: unknown;
  vat_type?: unknown;
  vat_mode?: unknown;
  total_amount?: unknown;
  grand_total?: unknown;
  department?: unknown;
  assignee?: unknown;
  assignee_name?: unknown;
  assigned_to?: unknown;
  assigned_to_name?: unknown;
  requester_name?: unknown;
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

const getJobPeopleAndDepartment = (job: JobRecord): {
  primaryPerson: string;
  department: string;
} => {
  const payload = parseJobPayload(job.payload);

  const assignee =
    asTrimmedString(job.assignee_name) ||
    asTrimmedString(job.assigned_to_name) ||
    asTrimmedString(job.assigned_to) ||
    asTrimmedString(job.assignee) ||
    asTrimmedString(payload.assignee) ||
    asTrimmedString(payload.assignee_name) ||
    asTrimmedString(payload.assigned_to_name) ||
    asTrimmedString(payload.assigned_to);

  const creator =
    asTrimmedString(job.created_by_name) ||
    asTrimmedString(job.requester_name) ||
    asTrimmedString(job.created_by) ||
    asTrimmedString(payload.requester_name);

  const department = asTrimmedString(job.department) || asTrimmedString(payload.department) || "ไม่ระบุแผนก";

  if (assignee) {
    return {
      primaryPerson: assignee,
      department
    };
  }

  if (creator) {
    return {
      primaryPerson: creator,
      department
    };
  }

  return {
    primaryPerson: "ไม่ระบุผู้รับผิดชอบ",
    department
  };
};

const formatJobCode = (jobId: unknown): string => {
  const id = asTrimmedString(jobId);
  if (!id) {
    return "JOB-00000";
  }

  if (/^\d+$/.test(id)) {
    return `JOB-${id.padStart(5, "0").slice(-5)}`;
  }

  return `JOB-${id.slice(-5)}`;
};

const normalizeSearchableText = (value: unknown): string => {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().toLocaleLowerCase();
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

  if (
    trimmed === "pending_review" ||
    trimmed === "awaiting_payment" ||
    trimmed === "needs_fix" ||
    trimmed === "pending_approval" ||
    trimmed === "document_pending" ||
    trimmed === "completed"
  ) {
    return trimmed;
  }

  if (trimmed === "precheck_pending") {
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

const getStatusLabel = (status: EffectiveStatus): string =>
  ({
    precheck_pending: "รอตรวจเบื้องต้น",
    document_pending: "รอสร้างเอกสาร",
    pending_approval: "รออนุมัติ",
    pending_review: "รอตรวจ",
    awaiting_payment: "รอเบิกจ่าย",
    needs_fix: "รอการแก้ไข",
    completed: "ดำเนินการแล้วเสร็จ"
  })[status];

const StatusActionDialog = dynamic(() => import("./StatusActionDialog"));

const statusClassName: Record<EffectiveStatus, string> = {
  precheck_pending: "border-yellow-200 bg-yellow-50 text-yellow-800 hover:bg-yellow-100 focus-visible:ring-yellow-300",
  document_pending: "border-indigo-100 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 focus-visible:ring-indigo-300",
  pending_approval: "border-purple-100 bg-purple-50 text-purple-700 hover:bg-purple-100 focus-visible:ring-purple-300",
  pending_review: "border-amber-100 bg-amber-50 text-amber-700 hover:bg-amber-100 focus-visible:ring-amber-300",
  awaiting_payment: "border-emerald-100 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 focus-visible:ring-emerald-300",
  needs_fix: "border-rose-100 bg-rose-50 text-rose-700 hover:bg-rose-100 focus-visible:ring-rose-300",
  completed: "border-sky-100 bg-sky-50 text-sky-700 hover:bg-sky-100 focus-visible:ring-sky-300"
};

const toDashboardItem = (job: JobRecord): DashboardJobItem => ({
  ...job,
  id: String(job.id ?? ""),
  status: normalizeStatus(job.status),
  isRemoving: false
});

const shouldLogDashboardPerf = process.env.NODE_ENV === "development";
const logDashboardPerf = (message: string): void => {
  if (!shouldLogDashboardPerf) {
    return;
  }

  console.info(message);
};

const measureDashboardPerf = <T,>(label: string, runner: () => T): T => {
  const startedAt = performance.now();
  logDashboardPerf(`[dashboard-perf] ${label}-start`);
  try {
    return runner();
  } finally {
    logDashboardPerf(`[dashboard-perf] ${label}-end duration=${(performance.now() - startedAt).toFixed(3)}ms`);
  }
};

export default function DashboardJobList({
  jobs,
  hasUserIdColumn,
  currentUserId,
  initialCompletedCount,
  hasMoreInitialJobs
}: DashboardJobListProps) {
  const router = useRouter();
  const [items, setItems] = useState<DashboardJobItem[]>(() =>
    measureDashboardPerf("jobs-list-transform-initial-map", () => jobs.map(toDashboardItem))
  );
  const [hasMoreActiveItems, setHasMoreActiveItems] = useState(hasMoreInitialJobs);
  const [isLoadingMoreActive, setIsLoadingMoreActive] = useState(false);
  const [completedItemsCache, setCompletedItemsCache] = useState<DashboardJobItem[] | null>(null);
  const [completedCount, setCompletedCount] = useState(initialCompletedCount);
  const [currentTab, setCurrentTab] = useState<DashboardTab>("active");
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("all");
  const [searchInput, setSearchInput] = useState("");
  const [submittedSearch, setSubmittedSearch] = useState("");
  const [isCompletedLoading, setIsCompletedLoading] = useState(false);
  const [completedError, setCompletedError] = useState<string | null>(null);

  const [dialog, setDialog] = useState<DialogState>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isPaymentProcessing, setIsPaymentProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cloningJobId, setCloningJobId] = useState<string | null>(null);
  const [paymentErrorMessage, setPaymentErrorMessage] = useState<string | null>(null);
  const [paymentSuccessMessage, setPaymentSuccessMessage] = useState<string | null>(null);
  const [needsFixDialog, setNeedsFixDialog] = useState<NeedsFixDialogState>(null);
  const [revisionNote, setRevisionNote] = useState("");
  const [revisionError, setRevisionError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setItems(measureDashboardPerf("jobs-list-transform-props-map", () => jobs.map(toDashboardItem)));
    setHasMoreActiveItems(hasMoreInitialJobs);
  }, [hasMoreInitialJobs, jobs]);

  const activeItems = useMemo(() => items.filter((item) => !isCompletedStatus(item) && !item.isRemoving), [items]);
  const precheckItems = useMemo(
    () => activeItems.filter((item) => normalizeStatus(item.status) === "precheck_pending"),
    [activeItems]
  );
  const mainFlowItems = useMemo(
    () => activeItems.filter((item) => normalizeStatus(item.status) !== "precheck_pending"),
    [activeItems]
  );
  const completedItems = useMemo(() => {
    const base = completedItemsCache ?? [];
    return base.filter((item) => isCompletedStatus(item) && !item.isRemoving);
  }, [completedItemsCache]);

  const fetchCompletedItems = async () => {
    if (completedItemsCache || isCompletedLoading) {
      return;
    }

    setIsCompletedLoading(true);
    setCompletedError(null);

    try {
      const fetchStartedAt = performance.now();
      logDashboardPerf("[dashboard-perf] summary-fetch-completed-start");
      const response = await fetch("/api/dashboard/completed", {
        method: "GET",
        cache: "no-store"
      });
      logDashboardPerf(`[dashboard-perf] summary-fetch-completed-end duration=${(performance.now() - fetchStartedAt).toFixed(3)}ms`);

      const payload = (await response.json()) as CompletedJobsResponse | { message?: string };

      if (!response.ok) {
        const message = "message" in payload && payload.message ? payload.message : "โหลดงานที่เสร็จแล้วไม่สำเร็จ";
        throw new Error(message);
      }

      setCompletedItemsCache(
        measureDashboardPerf("summary-render-completed-map", () => (payload as CompletedJobsResponse).jobs.map(toDashboardItem))
      );
    } catch (err) {
      setCompletedError(err instanceof Error ? err.message : "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ");
    } finally {
      setIsCompletedLoading(false);
    }
  };

  const handleTabChange = (nextTab: DashboardTab) => {
    setCurrentTab(nextTab);
    if (nextTab === "active") {
      setActiveFilter("all");
    }

    if (nextTab === "completed") {
      void fetchCompletedItems();
    }
  };

  const handleSearchSubmit = () => {
    setSubmittedSearch(searchInput.trim());
  };

  const handleClearSearch = () => {
    setSearchInput("");
    setSubmittedSearch("");
  };

  const handleLoadMoreActive = async () => {
    if (isLoadingMoreActive || !hasMoreActiveItems) {
      return;
    }

    setIsLoadingMoreActive(true);
    try {
      const fetchStartedAt = performance.now();
      logDashboardPerf("[dashboard-perf] jobs-fetch-load-more-start");
      const response = await fetch("/api/dashboard/jobs", {
        method: "GET",
        cache: "no-store"
      });
      logDashboardPerf(`[dashboard-perf] jobs-fetch-load-more-end duration=${(performance.now() - fetchStartedAt).toFixed(3)}ms`);

      const payload = (await response.json()) as { jobs?: JobRecord[]; message?: string };
      if (!response.ok || !Array.isArray(payload.jobs)) {
        throw new Error(payload.message ?? "โหลดรายการงานเพิ่มเติมไม่สำเร็จ");
      }

      const jobsPayload = payload.jobs;
      const nextItems = measureDashboardPerf("jobs-transform-load-more-map", () => jobsPayload.map(toDashboardItem));
      setItems(nextItems);
      setHasMoreActiveItems(false);
    } catch (error) {
      setCompletedError(error instanceof Error ? error.message : "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ");
    } finally {
      setIsLoadingMoreActive(false);
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
      setCompletedCount((prev) => prev + 1);
      setCompletedItemsCache((prev) => {
        if (!prev || currentTab !== "completed") {
          return prev;
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

    const eProcurement = getEProcurementCardData(payload);

    if (process.env.NODE_ENV === "development") {
      console.info("[dashboard] e-procurement mapping", {
        payload_keys: Object.keys(payload),
        summary_source: eProcurement.summary.source,
        vendor_source: eProcurement.vendorName.source,
        tax_id_source: eProcurement.taxId.source,
        total_source: eProcurement.totalInclVat.source
      });
    }

    setDialog({
      id,
      title,
      status,
      returnFromStatus: asTrimmedString(job.return_from_status),
      detailsText: eProcurement.summary.value,
      vendorName: eProcurement.vendorName.value,
      taxId: eProcurement.taxId.value || asTrimmedString(job.tax_id),
      grandTotal: eProcurement.totalInclVat.value
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

  const handleRequestNeedsFix = () => {
    if (!dialog || (dialog.status !== "pending_review" && dialog.status !== "precheck_pending") || isSaving) {
      return;
    }

    setNeedsFixDialog({ id: dialog.id, title: dialog.title });
    setRevisionNote("");
    setRevisionError(null);
    setIsSubmitting(false);
    setErrorMessage(null);
  };

  const handleSubmitNeedsFix = async () => {
    if (!needsFixDialog || isSubmitting) {
      return;
    }

    if (hasUserIdColumn && !currentUserId) {
      setRevisionError("ไม่พบผู้ใช้งานปัจจุบัน จึงไม่สามารถส่งกลับแก้ไขได้");
      return;
    }

    const trimmedNote = revisionNote.trim();
    if (!trimmedNote) {
      setRevisionError("กรุณาระบุรายการที่ต้องแก้ไขก่อนส่งกลับ");
      return;
    }

    setIsSubmitting(true);
    setRevisionError(null);

    try {
      const response = await fetch(`/api/jobs/${encodeURIComponent(needsFixDialog.id)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ status: "needs_fix", revisionNote: trimmedNote })
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        setRevisionError(payload?.message ?? "ส่งกลับแก้ไขไม่สำเร็จ");
        return;
      }

      const payload = (await response.json().catch(() => null)) as { job?: JobRecord } | null;
      const updatedJob = payload?.job ?? null;
      setItems((prev) =>
        prev.map((item) =>
          item.id === needsFixDialog.id
            ? {
                ...item,
                status: "needs_fix",
                revision_note: trimmedNote,
                return_from_status:
                  typeof updatedJob?.return_from_status === "string"
                    ? updatedJob.return_from_status
                    : item.return_from_status
              }
            : item
        )
      );
      setNeedsFixDialog(null);
      setDialog(null);
      setRevisionNote("");
      setRevisionError(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCloneAsNewJob = async (jobId: string) => {
    if (!jobId || cloningJobId) {
      return;
    }

    setErrorMessage(null);
    setCloningJobId(jobId);

    try {
      const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/clone`, {
        method: "POST"
      });
      const payload = (await response.json().catch(() => null)) as { message?: string; jobId?: string } | null;

      if (!response.ok || !payload?.jobId) {
        throw new Error(payload?.message ?? "ไม่สามารถคัดลอกเป็นงานใหม่ได้");
      }

      router.push(`/?job=${encodeURIComponent(payload.jobId)}&mode=clone&source=${encodeURIComponent(jobId)}`);
      router.refresh();
    } catch (cloneError) {
      setErrorMessage(cloneError instanceof Error ? cloneError.message : "ไม่สามารถคัดลอกเป็นงานใหม่ได้");
    } finally {
      setCloningJobId(null);
    }
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

  const hasAnyItems = activeItems.length > 0 || completedCount > 0 || isCompletedLoading;

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

  const filteredItemsByTab = currentTab === "active"
    ? activeFilter === "all"
      ? activeItems
      : activeFilter === "main_flow"
        ? mainFlowItems
        : precheckItems
    : completedItems;

  const normalizedSubmittedSearch = normalizeSearchableText(submittedSearch);
  const hasSubmittedSearch = normalizedSubmittedSearch.length > 0;
  const tableItems = hasSubmittedSearch
    ? filteredItemsByTab.filter((job) => {
      const metadata = getJobPeopleAndDepartment(job);
      const searchableValues = [
        getJobTitle(job),
        formatJobCode(job.id),
        metadata.primaryPerson,
        metadata.department
      ];

      return searchableValues.some((value) => normalizeSearchableText(value).includes(normalizedSubmittedSearch));
    })
    : filteredItemsByTab;

  return (
    <>
      <div className="mt-6 mb-4 flex gap-2 border-b border-gray-200">
        <button
          type="button"
          onClick={() => handleTabChange("active")}
          className={`px-4 py-2 text-sm transition ${
            currentTab === "active"
              ? "border-b-2 border-purple-500 font-semibold text-gray-900"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          กำลังดำเนินการ
        </button>
        <button
          type="button"
          onClick={() => handleTabChange("completed")}
          className={`px-4 py-2 text-sm transition ${
            currentTab === "completed"
              ? "border-b-2 border-purple-500 font-semibold text-gray-900"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          งานที่เสร็จแล้ว
        </button>
      </div>
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        {currentTab === "active" ? (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveFilter("all")}
              className={`rounded-full border px-3 py-1 text-sm font-medium transition ${
                activeFilter === "all" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              ทั้งหมด
            </button>
            <button
              type="button"
              onClick={() => setActiveFilter("main_flow")}
              className={`rounded-full border px-3 py-1 text-sm font-medium transition ${
                activeFilter === "main_flow"
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              กระบวนการหลัก
            </button>
            <button
              type="button"
              onClick={() => setActiveFilter("precheck")}
              className={`rounded-full border px-3 py-1 text-sm font-medium transition ${
                activeFilter === "precheck"
                  ? "border-yellow-600 bg-yellow-500 text-white"
                  : "border-yellow-300 bg-yellow-50 text-yellow-800 hover:bg-yellow-100"
              }`}
            >
              รอตรวจเบื้องต้น
            </button>
          </div>
        ) : (
          <div />
        )}
        <form
          className="flex w-full flex-wrap items-center gap-2 lg:w-auto"
          onSubmit={(event) => {
            event.preventDefault();
            handleSearchSubmit();
          }}
        >
          <div className="relative min-w-[250px] flex-1 lg:w-[380px] lg:flex-none">
            <input
              type="text"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="ค้นหาชื่องาน, รหัสงาน หรือผู้ยื่น..."
              className="focus-ring w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 pr-10 text-sm text-slate-700 shadow-sm placeholder:text-slate-400"
              aria-label="ค้นหารายการงาน"
            />
            {searchInput ? (
              <button
                type="button"
                onClick={handleClearSearch}
                className="focus-ring absolute right-2 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                aria-label="ล้างคำค้นหา"
              >
                <span aria-hidden="true">×</span>
              </button>
            ) : null}
          </div>
          <button
            type="submit"
            className="focus-ring inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-purple-600 via-fuchsia-500 to-orange-500 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_8px_18px_rgba(147,51,234,0.28)] transition hover:brightness-105"
          >
            Search
          </button>
        </form>
      </div>

      <div className="mt-2 overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-[var(--soft-shadow)]">
        <div className="hidden grid-cols-12 gap-3 border-b border-gray-100 bg-white px-6 py-3 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500 sm:grid">
          <p className="col-span-5">ชื่องาน</p>
          <p className="col-span-3">สร้างเมื่อ</p>
          <p className="col-span-2">สถานะ</p>
          <p className="col-span-2 text-right">การทำงาน</p>
        </div>

        {isCompletedLoading && currentTab === "completed" ? (
          <div>
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="grid gap-4 border-b border-gray-100 px-5 py-4 sm:grid-cols-12 sm:items-center sm:px-6">
                <div className="skeleton-shimmer h-4 rounded sm:col-span-5" />
                <div className="skeleton-shimmer h-4 rounded sm:col-span-3" />
                <div className="skeleton-shimmer h-4 rounded sm:col-span-2" />
                <div className="skeleton-shimmer h-4 rounded sm:col-span-2" />
              </div>
            ))}
          </div>
        ) : (
          <div>
            {tableItems.map((job) => {
              const status = normalizeStatus(job.status);
              const id = String(job.id ?? "");
              const isCompletedTab = currentTab === "completed";
              const metadata = getJobPeopleAndDepartment(job);

              return (
                <div
                  key={id}
                  className={`group relative grid gap-4 border-b border-gray-100 px-5 py-4 transition duration-200 hover:bg-gray-50 sm:grid-cols-12 sm:items-center sm:px-6 ${
                    job.isRemoving ? "pointer-events-none translate-y-0.5 opacity-0" : ""
                  }`}
                >
                  <div className="sm:col-span-5">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-400 sm:hidden">ชื่องาน</p>
                    <div className="flex flex-col space-y-0.5">
                      <p className="text-sm font-semibold text-gray-900">{getJobTitle(job)}</p>
                      <p className="text-xs text-gray-500">
                        {metadata.primaryPerson} • {metadata.department}
                      </p>
                      <p className="text-xs text-gray-400" title={`เลขที่งาน: ${formatJobCode(id)}`}>
                        {formatJobCode(id)}
                      </p>
                    </div>
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
                          // Disable Next.js auto-prefetch for per-job links to prevent N+1 background requests on dashboard render.
                          prefetch={false}
                          className="focus-ring rounded-lg px-2 py-1 text-sm font-semibold text-purple-700 underline decoration-purple-300 decoration-2 underline-offset-4 transition hover:text-purple-900"
                        >
                          ดูรายละเอียด
                        </Link>
                        <button
                          type="button"
                          onClick={() => void handleCloneAsNewJob(id)}
                          disabled={cloningJobId === id}
                          className="focus-ring rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
                        >
                          {cloningJobId === id ? "กำลังคัดลอก..." : "คัดลอกเป็นงานใหม่"}
                        </button>
                      </>
                    ) : (
                      <>
                        {status === "precheck_pending" ? (
                          <button
                            type="button"
                            onClick={() => handleStatusClick(job, status)}
                            className="focus-ring rounded-lg bg-yellow-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-yellow-600"
                          >
                            ตรวจเบื้องต้น
                          </button>
                        ) : null}
                        <Link
                          href={`/?job=${encodeURIComponent(id)}`}
                          prefetch={false}
                          className="focus-ring rounded-lg px-2 py-1 text-sm font-semibold text-purple-700 underline decoration-purple-300 decoration-2 underline-offset-4 transition hover:text-purple-900"
                        >
                          {status === "precheck_pending" ? "ดูรายละเอียด" : status === "document_pending" ? "สร้างเอกสาร" : "แก้ไขงานนี้ →"}
                        </Link>
                        <Link
                          href={`/dashboard/${encodeURIComponent(id)}`}
                          prefetch={false}
                          className="focus-ring rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
                        >
                          {status === "precheck_pending" ? "เปิดหน้างาน" : status === "document_pending" ? "รายละเอียดงาน" : "ดูรายละเอียด"}
                        </Link>
                      </>
                    )}
                  </div>
                </div>
              );
            })}

            {!isCompletedLoading && tableItems.length === 0 ? (
              <div className="px-6 py-10 text-center text-sm text-slate-500">
                {hasSubmittedSearch
                  ? "ไม่พบรายการที่ค้นหา"
                  : currentTab === "active"
                    ? "ไม่มีงานที่กำลังดำเนินการ"
                    : "ยังไม่มีงานที่เสร็จแล้ว"}
              </div>
            ) : null}
          </div>
        )}
      </div>

      {currentTab === "active" && hasMoreActiveItems ? (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={() => void handleLoadMoreActive()}
            disabled={isLoadingMoreActive}
            className="focus-ring rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoadingMoreActive ? "กำลังโหลด..." : "โหลดรายการเพิ่มเติม"}
          </button>
        </div>
      ) : null}

      {completedError ? <div className="mt-3 text-sm text-rose-600">{completedError}</div> : null}

      {errorMessage ? (
        <div className="fixed right-4 top-4 z-[60] max-w-sm rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow">
          {errorMessage}
        </div>
      ) : null}

      {needsFixDialog && revisionError ? (
        <div className="fixed right-4 top-4 z-[70] max-w-sm rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 shadow">
          {revisionError}
        </div>
      ) : null}

      <StatusActionDialog
        open={Boolean(dialog)}
        jobId={dialog?.id ?? ""}
        jobTitle={dialog?.title ?? ""}
        status={dialog?.status ?? "pending_approval"}
        returnFromStatus={dialog?.returnFromStatus ?? ""}
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
        onRequestNeedsFix={handleRequestNeedsFix}
        onMarkPaymentDone={handleMarkPaymentDone}
      />

      {needsFixDialog ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-2xl border border-white/30 bg-gradient-to-br from-white via-purple-50 to-orange-50 p-6 shadow-2xl">
            <h2 className="text-lg font-semibold text-slate-900">ส่งกลับแก้ไข</h2>
            <p className="mt-1 text-sm text-slate-600">{needsFixDialog.title}</p>

            <div className="mt-4">
              <label htmlFor="revision-note" className="mb-2 block text-sm font-medium text-slate-800">
                ต้องแก้ไขอะไร
              </label>
              <textarea
                id="revision-note"
                value={revisionNote}
                onChange={(event) => {
                  setRevisionNote(event.target.value);
                  if (revisionError) {
                    setRevisionError(null);
                  }
                }}
                placeholder="ระบุรายการที่ต้องแก้ไข เช่น …"
                rows={5}
                className="w-full rounded-2xl border border-purple-200 bg-white/90 px-4 py-3 text-sm text-slate-800 shadow-inner outline-none transition focus:border-purple-400 focus:ring-2 focus:ring-purple-200"
              />
              {revisionError ? <p className="mt-2 text-sm text-rose-400">{revisionError}</p> : null}
            </div>

            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  if (isSubmitting) {
                    return;
                  }

                  setNeedsFixDialog(null);
                  setRevisionNote("");
                  setRevisionError(null);
                  setIsSubmitting(false);
                }}
                disabled={isSubmitting}
                className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleSubmitNeedsFix}
                disabled={isSubmitting || revisionNote.trim() === ""}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-purple-600 via-fuchsia-500 to-orange-500 px-4 py-2 text-sm font-semibold text-white shadow-[0_10px_20px_rgba(147,51,234,0.35)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/60 border-t-white" aria-hidden="true" />
                    กำลังส่งกลับ...
                  </>
                ) : (
                  "ส่งกลับแก้ไข"
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
