"use client";

import { useState } from "react";

const MAIN_FLOW_ENTRY_STATUS = "document_pending";

type DashboardPrecheckActionsProps = {
  jobId: string;
};

export default function DashboardPrecheckActions({ jobId }: DashboardPrecheckActionsProps) {
  const [note, setNote] = useState("");
  const [loadingAction, setLoadingAction] = useState<"main" | "fix" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const updateStatus = async (status: string, action: "main" | "fix") => {
    setLoadingAction(action);
    setMessage(null);
    setError(null);

    const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        status,
        revisionNote: action === "fix" ? note.trim() : undefined
      })
    });

    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    if (!response.ok) {
      setError(payload?.message ?? "อัปเดตสถานะไม่สำเร็จ");
      setLoadingAction(null);
      return;
    }

    setMessage(action === "main" ? "ส่งเข้าขั้นสร้างเอกสารแล้ว" : "ส่งกลับให้แก้ไขแล้ว");
    setLoadingAction(null);
    window.setTimeout(() => {
      window.location.reload();
    }, 500);
  };

  return (
    <div className="mt-6 rounded-xl border border-yellow-200 bg-yellow-50 p-4">
      <h2 className="text-base font-semibold text-yellow-900">การตรวจเบื้องต้น</h2>
      <p className="mt-1 text-sm text-yellow-800">งานนี้ยังไม่เข้าสู่ flow หลัก คุณสามารถตรวจแล้วส่งเข้ากระบวนการหลักหรือส่งกลับให้แก้ไข</p>

      <label className="mt-4 block text-sm font-medium text-yellow-900" htmlFor="precheck-note">
        หมายเหตุการตรวจเบื้องต้น (ใช้เมื่อต้องส่งกลับแก้ไข)
      </label>
      <textarea
        id="precheck-note"
        value={note}
        onChange={(event) => setNote(event.target.value)}
        rows={3}
        className="mt-2 w-full rounded-lg border border-yellow-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-yellow-500 focus:ring-2 focus:ring-yellow-200"
        placeholder="ระบุสิ่งที่ต้องแก้ไข (ถ้ามี)"
      />

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void updateStatus(MAIN_FLOW_ENTRY_STATUS, "main")}
          disabled={loadingAction !== null}
          className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loadingAction === "main" ? "กำลังส่ง..." : "ส่งเข้ากระบวนการหลัก"}
        </button>
        <button
          type="button"
          onClick={() => void updateStatus("needs_fix", "fix")}
          disabled={loadingAction !== null || note.trim() === ""}
          className="rounded-full border border-amber-400 bg-amber-100 px-4 py-2 text-sm font-medium text-amber-800 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loadingAction === "fix" ? "กำลังส่ง..." : "ส่งกลับให้แก้ไข"}
        </button>
      </div>

      {message ? <p className="mt-3 text-sm text-green-700">{message}</p> : null}
      {error ? <p className="mt-3 text-sm text-rose-700">{error}</p> : null}
    </div>
  );
}
