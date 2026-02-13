"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

type ProcureFormProps = {
  mode: "create" | "edit";
  caseId?: string;
  initialData?: Record<string, unknown>;
};

export function ProcureForm({ mode, caseId, initialData }: ProcureFormProps) {
  const router = useRouter();
  const [title, setTitle] = useState(String(initialData?.subject ?? ""));
  const [department, setDepartment] = useState(String(initialData?.department ?? ""));
  const [purpose, setPurpose] = useState(String(initialData?.purpose ?? ""));
  const [vendorName, setVendorName] = useState(String(initialData?.vendor_name ?? ""));
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const payload = {
    department,
    subject: title,
    purpose,
    vendor_name: vendorName,
    items: []
  };

  const [generating, setGenerating] = useState(false);

  const submitPayload = { title, department, form_data: payload };

  const createOrUpdate = async () => {
    const url = mode === "create" ? "/api/procure/cases" : `/api/procure/cases/${caseId}`;
    const method = mode === "create" ? "POST" : "PATCH";

    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(submitPayload)
    });

    return { response, result: (await response.json()) as { id?: string; message?: string } };
  };

  const onSave = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setMessage(null);

    const { response, result } = await createOrUpdate();

    if (!response.ok) {
      setMessage(result.message ?? "บันทึกไม่สำเร็จ");
      setLoading(false);
      return;
    }

    if (mode === "create" && result.id) {
      router.push(`/procure/${result.id}/edit`);
      router.refresh();
      return;
    }

    setMessage("บันทึกข้อมูลเรียบร้อย");
    setLoading(false);
    router.refresh();
  };

  const onGenerate = async () => {
    setGenerating(true);
    setMessage(null);

    const { response, result } = await createOrUpdate();
    if (!response.ok) {
      setMessage(result.message ?? "บันทึกไม่สำเร็จ");
      setGenerating(false);
      return;
    }

    const resolvedId = mode === "create" ? result.id : caseId;
    const generateResponse = await fetch(`/api/procure/cases/${resolvedId}/generate`, { method: "POST" });
    const generateResult = (await generateResponse.json()) as { message?: string };

    if (!generateResponse.ok) {
      setMessage(generateResult.message ?? "Generate ไม่สำเร็จ");
      setGenerating(false);
      return;
    }

    router.push("/procure");
    router.refresh();
  };

  return (
    <form onSubmit={onSave} style={{ display: "grid", gap: 12, maxWidth: 720 }}>
      <label>
        ชื่องานซื้ออะไร
        <input required value={title} onChange={(event) => setTitle(event.target.value)} />
      </label>
      <label>
        แผนก
        <input required value={department} onChange={(event) => setDepartment(event.target.value)} />
      </label>
      <label>
        วัตถุประสงค์
        <textarea value={purpose} onChange={(event) => setPurpose(event.target.value)} />
      </label>
      <label>
        ผู้ขาย
        <input value={vendorName} onChange={(event) => setVendorName(event.target.value)} />
      </label>

      <button disabled={loading} type="submit">
        {loading ? "กำลังบันทึก..." : "บันทึกแบบร่าง"}
      </button>
      <button disabled={generating} type="button" onClick={onGenerate}>
        {generating ? "กำลัง Generate..." : "Generate"}
      </button>
      {message && <p>{message}</p>}
    </form>
  );
}
