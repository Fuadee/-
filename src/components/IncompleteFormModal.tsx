"use client";

import { useEffect } from "react";

type IncompleteFormModalProps = {
  open: boolean;
  missingFields: string[];
  onClose: () => void;
};

export default function IncompleteFormModal({ open, missingFields, onClose }: IncompleteFormModalProps) {
  useEffect(() => {
    if (!open) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-all duration-200 ${
        open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
      }`}
      aria-hidden={!open}
    >
      <button
        type="button"
        aria-label="ปิดหน้าต่างแจ้งเตือน"
        onClick={onClose}
        className="fixed inset-0 bg-black/40 backdrop-blur-sm"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="incomplete-form-modal-title"
        className={`relative z-10 w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl transition-all duration-200 ${
          open ? "scale-100 opacity-100" : "scale-95 opacity-0"
        }`}
      >
        <div className="mb-5 inline-flex rounded-full bg-gradient-to-r from-purple-600 to-orange-500 px-4 py-1 text-sm font-semibold text-white">
          แจ้งเตือน
        </div>
        <h2 id="incomplete-form-modal-title" className="text-xl font-bold text-slate-900">
          ยังกรอกข้อมูลไม่ครบ
        </h2>
        <p className="mt-2 text-sm text-slate-600">กรุณาตรวจสอบช่องสีแดง แล้วลองกดบันทึกอีกครั้ง</p>

        {missingFields.length > 0 && (
          <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-slate-700">
            {missingFields.map((field) => (
              <li key={field}>{field}</li>
            ))}
          </ul>
        )}

        <button
          type="button"
          onClick={onClose}
          className="mt-6 w-full rounded-xl bg-gradient-to-r from-purple-600 to-orange-500 px-4 py-2.5 font-semibold text-white shadow-lg transition hover:brightness-110"
        >
          รับทราบ
        </button>
      </div>
    </div>
  );
}
