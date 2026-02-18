"use client";

import { useEffect, useMemo, useState } from "react";

type EffectiveStatus = "pending_approval" | "pending_review" | "awaiting_payment" | "needs_fix";

type StatusActionDialogProps = {
  open: boolean;
  jobTitle: string;
  status: EffectiveStatus;
  detailsText: string;
  vendorName: string;
  taxId: string;
  grandTotal: number | null;
  isSaving: boolean;
  errorMessage: string | null;
  onClose: () => void;
  onUpdateStatus: (nextStatus: EffectiveStatus) => void;
};

type CopyRow = {
  key: string;
  label: string;
  value: string;
};

const formatMoneyTH = (value: number | null): string => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "-";
  }

  return new Intl.NumberFormat("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
};

const getDisplayValue = (value: string): string => (value.trim() ? value : "-");

function UpdateStatusCopySection({ detailsText, vendorName, taxId, grandTotal }: Pick<StatusActionDialogProps, "detailsText" | "vendorName" | "taxId" | "grandTotal">) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!copiedKey) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setCopiedKey(null);
    }, 900);

    return () => window.clearTimeout(timeoutId);
  }, [copiedKey]);

  const moneyText = formatMoneyTH(grandTotal);

  const rows = useMemo<CopyRow[]>(
    () => [
      {
        key: "details",
        label: "รายละเอียดการจัดซื้อโดยสรุป",
        value: detailsText
      },
      {
        key: "budget",
        label: "วงเงินงบประมาณ (รวมภาษีมูลค่าเพิ่ม)",
        value: moneyText === "-" ? "" : moneyText
      },
      {
        key: "median_price",
        label: "ราคากลาง (รวมภาษีมูลค่าเพิ่ม)",
        value: moneyText === "-" ? "" : moneyText
      },
      {
        key: "vendor",
        label: "ผู้ได้รับคัดเลือก",
        value: vendorName
      },
      {
        key: "tax_id",
        label: "เลขประจำตัวผู้เสียภาษีอากร",
        value: taxId
      },
      {
        key: "procurement_budget",
        label: "วงเงินที่จัดซื้อจัดจ้าง (รวมภาษีมูลค่าเพิ่ม)",
        value: moneyText === "-" ? "" : moneyText
      }
    ],
    [detailsText, moneyText, taxId, vendorName]
  );

  const handleCopy = async (key: string, value: string) => {
    await navigator.clipboard.writeText(value.trim() ? value : "");
    setCopiedKey(key);
  };

  const handleCopyAll = async () => {
    const text = rows.map((row) => `${row.label} ${row.value.trim() ? row.value : ""}`).join("\n");
    await navigator.clipboard.writeText(text);
    setCopiedKey("all");
  };

  return (
    <section className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-900">คัดลอกไปกรอกใน e-Procurement</h3>
        <button
          type="button"
          onClick={handleCopyAll}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
        >
          {copiedKey === "all" ? "คัดลอกแล้ว" : "คัดลอกทั้งหมด"}
        </button>
      </div>

      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row.key} className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-slate-500">{row.label}</p>
              <p className="break-words text-sm text-slate-900">{getDisplayValue(row.value)}</p>
            </div>
            <button
              type="button"
              onClick={() => handleCopy(row.key, row.value)}
              className="shrink-0 rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
            >
              {copiedKey === row.key ? "คัดลอกแล้ว" : "Copy"}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

export type { EffectiveStatus };

export default function StatusActionDialog({
  open,
  jobTitle,
  status,
  detailsText,
  vendorName,
  taxId,
  grandTotal,
  isSaving,
  errorMessage,
  onClose,
  onUpdateStatus
}: StatusActionDialogProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        {status === "pending_approval" ? (
          <>
            <h2 className="text-lg font-semibold text-slate-900">อัปเดตสถานะงาน</h2>
            <p className="mt-2 text-sm text-slate-600">{jobTitle}</p>
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

            <UpdateStatusCopySection detailsText={detailsText} vendorName={vendorName} taxId={taxId} grandTotal={grandTotal} />

            {errorMessage ? (
              <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage}</p>
            ) : null}

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isSaving}
                className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                ยังไม่ลง
              </button>
              <button
                type="button"
                onClick={() => onUpdateStatus("pending_review")}
                disabled={isSaving}
                className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSaving ? "กำลังบันทึก..." : "ลงแล้ว"}
              </button>
            </div>
          </>
        ) : null}

        {status === "pending_review" ? (
          <>
            <h2 className="text-lg font-semibold text-slate-900">ตรวจแล้วเสร็จ</h2>
            <p className="mt-2 text-sm text-slate-600">{jobTitle}</p>

            {errorMessage ? (
              <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage}</p>
            ) : null}

            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isSaving}
                className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={() => onUpdateStatus("needs_fix")}
                disabled={isSaving}
                className="rounded-full border border-amber-400 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-700 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                กลับไปแก้ไข
              </button>
              <button
                type="button"
                onClick={() => onUpdateStatus("awaiting_payment")}
                disabled={isSaving}
                className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                ตรวจผ่าน
              </button>
            </div>
          </>
        ) : null}

        {status === "needs_fix" ? (
          <>
            <h2 className="text-lg font-semibold text-slate-900">แก้ไขเสร็จแล้วหรือไม่?</h2>
            <p className="mt-2 text-sm text-slate-600">{jobTitle}</p>

            {errorMessage ? (
              <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage}</p>
            ) : null}

            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isSaving}
                className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={onClose}
                disabled={isSaving}
                className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                ยัง
              </button>
              <button
                type="button"
                onClick={() => onUpdateStatus("pending_review")}
                disabled={isSaving}
                className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                ใช่
              </button>
            </div>
          </>
        ) : null}

        {status === "awaiting_payment" ? (
          <>
            <h2 className="text-lg font-semibold text-slate-900">สถานะรอเบิกจ่าย</h2>
            <p className="mt-2 text-sm text-slate-600">{jobTitle}</p>

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
              >
                ปิด
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
