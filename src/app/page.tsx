"use client";

import { FormEvent, useState } from "react";

type ItemForm = {
  no?: number;
  name: string;
  qty: string;
  unit: string;
  price: string;
  spec: string;
};

type ApiErrorResponse = {
  message?: string;
  properties?: unknown;
};

const createEmptyItem = (): ItemForm => ({
  no: 1,
  name: "",
  qty: "",
  unit: "",
  price: "",
  spec: ""
});

const parseNumber = (value: string): number => {
  const normalized = Number(value.replace(/,/g, "").trim());
  return Number.isFinite(normalized) ? normalized : 0;
};

export default function HomePage() {
  const [department, setDepartment] = useState("");
  const [subject, setSubject] = useState("");
  const [subjectDetail, setSubjectDetail] = useState("");
  const [purpose, setPurpose] = useState("");
  const [budgetAmount, setBudgetAmount] = useState("");
  const [budgetSource, setBudgetSource] = useState("");
  const [assignee, setAssignee] = useState("");
  const [items, setItems] = useState<ItemForm[]>([createEmptyItem()]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateItem = (index: number, field: keyof ItemForm, value: string) => {
    setItems((prevItems) =>
      prevItems.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item
      )
    );
  };

  const addItem = () => {
    setItems((prevItems) => [...prevItems, createEmptyItem()]);
  };

  const removeItem = (index: number) => {
    setItems((prevItems) => {
      if (prevItems.length === 1) {
        return [createEmptyItem()];
      }
      return prevItems.filter((_, itemIndex) => itemIndex !== index);
    });
  };

  const itemTotal = (item: ItemForm) => parseNumber(item.qty) * parseNumber(item.price);
  const grandTotal = items.reduce((sum, item) => sum + itemTotal(item), 0);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const payload = {
        department,
        subject,
        subject_detail: subjectDetail,
        purpose,
        budget_amount: budgetAmount,
        budget_source: budgetSource,
        assignee,
        items: items.map((item, index) => ({
          ...item,
          no: index + 1,
          spec: item.spec ?? "",
          total: itemTotal(item)
        }))
      };

      const response = await fetch("/api/gen-docx", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        let apiError: ApiErrorResponse | null = null;
        try {
          apiError = (await response.json()) as ApiErrorResponse;
        } catch {
          apiError = null;
        }

        const message = apiError?.message ?? "ไม่สามารถสร้างไฟล์ได้";
        const properties =
          apiError?.properties !== undefined
            ? `\nproperties: ${JSON.stringify(apiError.properties, null, 2)}`
            : "";
        throw new Error(`${message}${properties}`);
      }

      const blob = await response.blob();
      const contentDisposition = response.headers.get("Content-Disposition");
      const fallbackName = `หนังสือราชการ_${new Date().toISOString().slice(0, 10)}.docx`;
      const filenameMatch = contentDisposition?.match(/filename\*=UTF-8''([^;]+)/i);
      const filename = filenameMatch?.[1] ? decodeURIComponent(filenameMatch[1]) : fallbackName;

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (submitError) {
      const message =
        submitError instanceof Error
          ? submitError.message
          : "เกิดข้อผิดพลาดในการสร้างไฟล์ กรุณาลองใหม่อีกครั้ง";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main>
      <div className="card">
        <h1>Generate DOCX</h1>
        <form onSubmit={handleSubmit}>
          <label htmlFor="department">แผนก</label>
          <input
            id="department"
            name="department"
            type="text"
            value={department}
            onChange={(event) => setDepartment(event.target.value)}
          />

          <label htmlFor="subject">เรื่อง</label>
          <input
            id="subject"
            name="subject"
            type="text"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            placeholder="กรอกชื่อเรื่อง"
          />

          <label htmlFor="subject_detail">รายละเอียดเรื่อง</label>
          <textarea
            id="subject_detail"
            name="subject_detail"
            value={subjectDetail}
            onChange={(event) => setSubjectDetail(event.target.value)}
          />

          <label htmlFor="purpose">เพื่อ</label>
          <textarea
            id="purpose"
            name="purpose"
            value={purpose}
            onChange={(event) => setPurpose(event.target.value)}
          />

          <label htmlFor="budget_amount">วงเงิน</label>
          <input
            id="budget_amount"
            name="budget_amount"
            type="text"
            value={budgetAmount}
            onChange={(event) => setBudgetAmount(event.target.value)}
          />

          <label htmlFor="budget_source">งบ</label>
          <input
            id="budget_source"
            name="budget_source"
            type="text"
            value={budgetSource}
            onChange={(event) => setBudgetSource(event.target.value)}
          />

          <label htmlFor="assignee">ผู้ได้รับมอบหมาย</label>
          <input
            id="assignee"
            name="assignee"
            type="text"
            value={assignee}
            onChange={(event) => setAssignee(event.target.value)}
          />

          <h2>รายละเอียดวัสดุ</h2>
          {items.map((item, index) => (
            <div key={`item-${index}`}>
              <label htmlFor={`item-no-${index}`}>ลำดับ</label>
              <input id={`item-no-${index}`} type="text" value={index + 1} readOnly />

              <label htmlFor={`item-name-${index}`}>ชื่อวัสดุ</label>
              <input
                id={`item-name-${index}`}
                type="text"
                value={item.name}
                onChange={(event) => updateItem(index, "name", event.target.value)}
              />

              <label htmlFor={`item-qty-${index}`}>จำนวน</label>
              <input
                id={`item-qty-${index}`}
                type="text"
                value={item.qty}
                onChange={(event) => updateItem(index, "qty", event.target.value)}
              />

              <label htmlFor={`item-unit-${index}`}>หน่วย</label>
              <input
                id={`item-unit-${index}`}
                type="text"
                value={item.unit}
                onChange={(event) => updateItem(index, "unit", event.target.value)}
              />

              <label htmlFor={`item-price-${index}`}>ราคา/หน่วย</label>
              <input
                id={`item-price-${index}`}
                type="text"
                value={item.price}
                onChange={(event) => updateItem(index, "price", event.target.value)}
              />

              <label htmlFor={`item-spec-${index}`}>รายละเอียดคุณลักษณะ (spec)</label>
              <textarea
                id={`item-spec-${index}`}
                value={item.spec}
                onChange={(event) => updateItem(index, "spec", event.target.value)}
              />

              <p>รวมรายการนี้: {itemTotal(item)}</p>
              <button type="button" onClick={() => removeItem(index)}>
                ลบ
              </button>
              <hr />
            </div>
          ))}

          <button type="button" onClick={addItem}>
            เพิ่มรายการ
          </button>

          <p>รวมทั้งหมด: {grandTotal}</p>

          <button type="submit" disabled={loading}>
            {loading ? "Generating..." : "Generate Word"}
          </button>
        </form>
        {error && <pre className="error">{error}</pre>}
      </div>
    </main>
  );
}
