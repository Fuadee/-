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

type GenSpecResponse = {
  spec?: string;
  message?: string;
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
  const [itemErrors, setItemErrors] = useState<Record<number, string>>({});
  const [generatingIndex, setGeneratingIndex] = useState<number | null>(null);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [generateProgress, setGenerateProgress] = useState<string | null>(null);
  const [previousSpecs, setPreviousSpecs] = useState<Record<number, string>>({});

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

  const clearItemError = (index: number) => {
    setItemErrors((prev) => {
      const next = { ...prev };
      delete next[index];
      return next;
    });
  };

  const fetchSpec = async (itemName: string): Promise<string> => {
    const response = await fetch("/api/items/gen-spec", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name: itemName,
        purpose,
        department,
        style: "medium"
      })
    });

    const payload = (await response.json()) as GenSpecResponse;

    if (!response.ok || !payload.spec) {
      throw new Error(payload.message ?? "ไม่สามารถสร้างสเปกได้");
    }

    return payload.spec;
  };

  const handleGenerateSpec = async (index: number) => {
    const item = items[index];
    if (!item?.name.trim()) {
      setItemErrors((prev) => ({ ...prev, [index]: "กรอกชื่อพัสดุก่อน" }));
      return;
    }

    clearItemError(index);
    setGeneratingIndex(index);
    setError(null);

    try {
      const generatedSpec = await fetchSpec(item.name.trim());
      setPreviousSpecs((prevSpecs) => ({
        ...prevSpecs,
        [index]: items[index]?.spec ?? ""
      }));
      setItems((prevItems) =>
        prevItems.map((prevItem, itemIndex) =>
          itemIndex === index ? { ...prevItem, spec: generatedSpec } : prevItem
        )
      );
    } catch (specError) {
      const message =
        specError instanceof Error ? specError.message : "เกิดข้อผิดพลาดในการสร้างสเปก";
      setError(message);
    } finally {
      setGeneratingIndex(null);
    }
  };

  const handleRestoreSpec = (index: number) => {
    if (!(index in previousSpecs)) {
      return;
    }

    setItems((prevItems) =>
      prevItems.map((item, itemIndex) =>
        itemIndex === index ? { ...item, spec: previousSpecs[index] ?? "" } : item
      )
    );
  };

  const handleGenerateAllSpecs = async () => {
    setGeneratingAll(true);
    setError(null);

    const targetIndexes = items
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => !item.spec.trim())
      .map(({ index }) => index);

    if (targetIndexes.length === 0) {
      setGenerateProgress("ไม่มีรายการที่ต้องสร้างเพิ่มเติม");
      setGeneratingAll(false);
      return;
    }

    for (let i = 0; i < targetIndexes.length; i += 1) {
      const index = targetIndexes[i];
      const item = items[index];

      setGenerateProgress(`${i + 1}/${targetIndexes.length}`);

      if (!item?.name.trim()) {
        setItemErrors((prev) => ({ ...prev, [index]: "กรอกชื่อพัสดุก่อน" }));
        continue;
      }

      clearItemError(index);
      setGeneratingIndex(index);

      try {
        const generatedSpec = await fetchSpec(item.name.trim());
        setPreviousSpecs((prevSpecs) => ({
          ...prevSpecs,
          [index]: items[index]?.spec ?? ""
        }));
        setItems((prevItems) =>
          prevItems.map((prevItem, itemIndex) =>
            itemIndex === index ? { ...prevItem, spec: generatedSpec } : prevItem
          )
        );
      } catch (specError) {
        const message =
          specError instanceof Error ? specError.message : "เกิดข้อผิดพลาดในการสร้างสเปก";
        setError(message);
      }
    }

    setGeneratingIndex(null);
    setGeneratingAll(false);
    setGenerateProgress(null);
  };

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
          <button type="button" onClick={handleGenerateAllSpecs} disabled={generatingAll || loading}>
            {generatingAll ? `กำลังสร้าง... ${generateProgress ?? ""}` : "Gen Spec ทั้งหมด"}
          </button>

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

              <button
                type="button"
                onClick={() => handleGenerateSpec(index)}
                disabled={loading || generatingAll || generatingIndex === index}
              >
                {generatingIndex === index ? "กำลังสร้าง…" : "Gen Spec"}
              </button>
              <button
                type="button"
                onClick={() => handleGenerateSpec(index)}
                disabled={loading || generatingAll || generatingIndex === index}
              >
                รีเจน
              </button>
              <button type="button" onClick={() => handleRestoreSpec(index)} disabled={!(index in previousSpecs)}>
                ย้อนไปค่าเดิม
              </button>

              {itemErrors[index] && <p className="error">{itemErrors[index]}</p>}

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
