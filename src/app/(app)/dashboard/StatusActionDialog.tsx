"use client";

type EffectiveStatus = "pending_approval" | "pending_review" | "awaiting_payment" | "needs_fix";

type StatusActionDialogProps = {
  open: boolean;
  jobTitle: string;
  status: EffectiveStatus;
  isSaving: boolean;
  errorMessage: string | null;
  onClose: () => void;
  onUpdateStatus: (nextStatus: EffectiveStatus) => void;
};

export type { EffectiveStatus };

export default function StatusActionDialog({
  open,
  jobTitle,
  status,
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
                ให้กลับไปไข
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
