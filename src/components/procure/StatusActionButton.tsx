"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { type ProcureStatus, statusLabel } from "@/lib/procure";

type Props = {
  caseId: string;
  status: ProcureStatus;
};

type DialogType = "EPROC" | "REVIEW" | "PAYMENT" | null;

export function StatusActionButton({ caseId, status }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [dialog, setDialog] = useState<DialogType>(null);

  const callTransition = async (action: string, note?: string) => {
    setLoading(true);
    const response = await fetch(`/api/procure/cases/${caseId}/transition`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, note })
    });

    if (!response.ok) {
      const data = (await response.json()) as { message?: string };
      alert(data.message ?? "ดำเนินการไม่สำเร็จ");
      setLoading(false);
      return;
    }

    setLoading(false);
    setDialog(null);
    router.refresh();
  };

  const openAction = () => {
    if (status === "DRAFT" || status === "WAIT_EPROC") {
      setDialog("EPROC");
      return;
    }
    if (status === "EPROC_DONE_WAITING") {
      alert("รายการนี้อยู่สถานะ ลงแล้ว รอดำเนินการ");
      return;
    }
    if (status === "WAIT_REVIEW") {
      setDialog("REVIEW");
      return;
    }
    if (status === "REVISION_REQUIRED") {
      alert("เอกสารต้องแก้ไข กรุณากดปุ่มแก้ไขเพื่อปรับข้อมูลและ Generate ใหม่");
      return;
    }
    if (status === "WAIT_PAYMENT") {
      setDialog("PAYMENT");
    }
  };

  return (
    <>
      <button disabled={loading || status === "DONE"} onClick={openAction} type="button">
        {statusLabel[status]}
      </button>

      {dialog === "EPROC" && (
        <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12, marginTop: 8 }}>
          <p>ดำเนินการลงข้อมูล E-Procurement</p>
          <Link href="https://eprocurement.pea.co.th/" target="_blank">
            ไปที่ระบบ E-Procurement
          </Link>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button onClick={() => callTransition("EPROC_DONE_WAITING", "ลงระบบแล้ว รอดำเนินการ")} type="button">
              ลงแล้ว รอดำเนินการ
            </button>
            <button onClick={() => callTransition("EPROC_DONE", "ดำเนินการลงข้อมูลแล้ว")} type="button">
              ดำเนินการแล้ว
            </button>
            <button onClick={() => setDialog(null)} type="button">
              ปิด
            </button>
          </div>
        </div>
      )}

      {dialog === "REVIEW" && (
        <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12, marginTop: 8 }}>
          <p>รอตรวจ</p>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => callTransition("REVIEW_PASS", "ตรวจผ่านแล้ว")} type="button">
              ผ่านแล้ว
            </button>
            <button onClick={() => callTransition("REVIEW_FAIL", "ตรวจไม่ผ่าน")} type="button">
              ไม่ผ่าน
            </button>
            <button onClick={() => setDialog(null)} type="button">
              ปิด
            </button>
          </div>
        </div>
      )}

      {dialog === "PAYMENT" && (
        <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12, marginTop: 8 }}>
          <p>รอเบิกจ่าย</p>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => callTransition("PAYMENT_DONE", "ดำเนินการเบิกจ่ายเสร็จสิ้น")} type="button">
              ดำเนินการแล้วเสร็จ
            </button>
            <button onClick={() => setDialog(null)} type="button">
              ปิด
            </button>
          </div>
        </div>
      )}
    </>
  );
}
