"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import styles from "./page.module.css";

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

type JobResponse = {
  job?: Record<string, unknown>;
  message?: string;
};

type ValidationErrors = {
  department?: string;
  subject?: string;
  purpose?: string;
  budgetAmount?: string;
  vendorName?: string;
  vendorAddress?: string;
  receiptNo?: string;
  approvedBy?: string;
  items?: string[];
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

const formatMoney = (value: number): string =>
  new Intl.NumberFormat("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);

const readThaiBaht = (value: number): string => {
  if (!Number.isFinite(value) || value <= 0) {
    return "ศูนย์บาทถ้วน";
  }

  const digitText = ["", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"];
  const positionText = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน", "ล้าน"];

  const toThaiNumber = (num: number): string => {
    if (num === 0) {
      return "";
    }

    let output = "";
    const text = String(num);

    for (let i = 0; i < text.length; i += 1) {
      const digit = Number(text[i]);
      const position = text.length - i - 1;

      if (digit === 0) {
        continue;
      }

      if (position === 0 && digit === 1 && text.length > 1) {
        output += "เอ็ด";
      } else if (position === 1 && digit === 2) {
        output += "ยี่";
      } else if (position === 1 && digit === 1) {
        output += "";
      } else {
        output += digitText[digit];
      }

      output += positionText[position % 6];

      if (position > 0 && position % 6 === 0) {
        output += "ล้าน";
      }
    }

    return output;
  };

  const integerValue = Math.floor(value);
  const satangValue = Math.round((value - integerValue) * 100);
  const baht = `${toThaiNumber(integerValue)}บาท`;

  if (satangValue === 0) {
    return `${baht}ถ้วน`;
  }

  return `${baht}${toThaiNumber(satangValue)}สตางค์`;
};

export default function HomePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editingJobId = searchParams.get("job")?.trim() || "";
  const [department, setDepartment] = useState("");
  const [subject, setSubject] = useState("");
  const [subjectDetail, setSubjectDetail] = useState("");
  const [purpose, setPurpose] = useState("");
  const [budgetAmount, setBudgetAmount] = useState("");
  const [vendorName, setVendorName] = useState("");
  const [vendorAddress, setVendorAddress] = useState("");
  const [receiptNo, setReceiptNo] = useState("");
  const [assignee, setAssignee] = useState("");
  const [assigneePosition, setAssigneePosition] = useState("");
  const [approvedBy, setApprovedBy] = useState("");
  const [items, setItems] = useState<ItemForm[]>([createEmptyItem()]);
  const [loading, setLoading] = useState(false);
  const [loadingJob, setLoadingJob] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({});
  const [vatIncluded] = useState(true);

  useEffect(() => {
    if (!editingJobId) {
      return;
    }

    const loadJob = async () => {
      setLoadingJob(true);
      setError(null);

      try {
        const response = await fetch(`/api/jobs/${encodeURIComponent(editingJobId)}`);
        const json = (await response.json()) as JobResponse;

        if (!response.ok) {
          throw new Error(json.message ?? "ไม่สามารถโหลดข้อมูลงานสำหรับแก้ไขได้");
        }

        const job = json.job ?? {};
        const payload = typeof job.payload === "object" && job.payload ? (job.payload as Record<string, unknown>) : job;

        setDepartment(typeof payload.department === "string" ? payload.department : "");
        setSubject(typeof payload.subject === "string" ? payload.subject : "");
        setSubjectDetail(typeof payload.subject_detail === "string" ? payload.subject_detail : "");
        setPurpose(typeof payload.purpose === "string" ? payload.purpose : "");
        setBudgetAmount(typeof payload.budget_amount === "string" ? payload.budget_amount : "");
        setVendorName(typeof payload.vendor_name === "string" ? payload.vendor_name : "");
        setVendorAddress(typeof payload.vendor_address === "string" ? payload.vendor_address : "");
        setReceiptNo(typeof payload.receipt_no === "string" ? payload.receipt_no : "");
        setAssignee(typeof payload.assignee === "string" ? payload.assignee : "");
        setAssigneePosition(typeof payload.assignee_position === "string" ? payload.assignee_position : "");
        setApprovedBy(typeof payload.approved_by === "string" ? payload.approved_by : "");

        const parsedItems = Array.isArray(payload.items)
          ? payload.items.map((item, index) => {
              const row = item as Record<string, unknown>;
              return {
                no: typeof row.no === "number" ? row.no : index + 1,
                name: typeof row.name === "string" ? row.name : "",
                qty: typeof row.qty === "string" || typeof row.qty === "number" ? String(row.qty) : "",
                unit: typeof row.unit === "string" ? row.unit : "",
                price: typeof row.price === "string" || typeof row.price === "number" ? String(row.price) : "",
                spec: typeof row.spec === "string" ? row.spec : ""
              };
            })
          : [];

        setItems(parsedItems.length > 0 ? parsedItems : [createEmptyItem()]);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "ไม่สามารถโหลดข้อมูลงานสำหรับแก้ไขได้");
      } finally {
        setLoadingJob(false);
      }
    };

    void loadJob();
  }, [editingJobId]);

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

  const resetForm = () => {
    const isConfirmed = window.confirm("ต้องการล้างข้อมูลทั้งหมดใช่หรือไม่?");
    if (!isConfirmed) {
      return;
    }

    setDepartment("");
    setSubject("");
    setSubjectDetail("");
    setPurpose("");
    setBudgetAmount("");
    setVendorName("");
    setVendorAddress("");
    setReceiptNo("");
    setAssignee("");
    setAssigneePosition("");
    setApprovedBy("");
    setItems([createEmptyItem()]);
    setError(null);
    setValidationErrors({});
  };

  const itemTotal = (item: ItemForm) => parseNumber(item.qty) * parseNumber(item.price);
  const grandTotal = items.reduce((sum, item) => sum + itemTotal(item), 0);
  const subtotalNet = vatIncluded ? grandTotal / 1.07 : grandTotal;
  const vatAmount = vatIncluded ? grandTotal - subtotalNet : grandTotal * 0.07;

  const itemErrors = useMemo(
    () =>
      items.map((item) => {
        if (!item.name.trim()) {
          return "กรุณากรอกชื่อวัสดุ";
        }
        if (parseNumber(item.qty) <= 0) {
          return "จำนวนต้องมากกว่า 0";
        }
        if (!item.unit.trim()) {
          return "กรุณากรอกหน่วย";
        }
        if (parseNumber(item.price) <= 0) {
          return "ราคาต่อหน่วยต้องมากกว่า 0";
        }
        return "";
      }),
    [items]
  );

  const validateForm = (): ValidationErrors => {
    const errors: ValidationErrors = {
      items: itemErrors
    };

    if (!department.trim()) errors.department = "กรุณากรอกแผนก";
    if (!subject.trim()) errors.subject = "กรุณากรอกเรื่อง";
    if (!purpose.trim()) errors.purpose = "กรุณากรอกวัตถุประสงค์";
    if (!budgetAmount.trim()) errors.budgetAmount = "กรุณากรอกวงเงิน";
    if (!vendorName.trim()) errors.vendorName = "กรุณากรอกชื่อผู้ขาย";
    if (!vendorAddress.trim()) errors.vendorAddress = "กรุณากรอกที่อยู่ผู้ขาย";
    if (!receiptNo.trim()) errors.receiptNo = "กรุณากรอกเลขที่ใบเสร็จ";
    if (!approvedBy.trim()) errors.approvedBy = "กรุณากรอกผู้อนุมัติ";

    return errors;
  };

  const hasValidationError = (errors: ValidationErrors): boolean => {
    return Boolean(
      errors.department ||
        errors.subject ||
        errors.purpose ||
        errors.budgetAmount ||
        errors.vendorName ||
        errors.vendorAddress ||
        errors.receiptNo ||
        errors.approvedBy ||
        errors.items?.some(Boolean)
    );
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const errors = validateForm();
    setValidationErrors(errors);

    if (hasValidationError(errors)) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const payload = {
        department,
        subject,
        subject_detail: subjectDetail,
        purpose,
        budget_amount: budgetAmount.trim(),
        budget_source: "",
        vendor_name: vendorName.trim(),
        vendor_address: vendorAddress.trim(),
        receipt_no: receiptNo.trim(),
        assignee: assignee.trim(),
        assignee_position: assigneePosition.trim(),
        approved_by: approvedBy.trim(),
        items: items.map((item, index) => ({
          ...item,
          no: index + 1,
          spec: item.spec ?? "",
          total: itemTotal(item)
        }))
      };

      const requestBody = editingJobId ? { ...payload, jobId: editingJobId } : payload;

      const response = await fetch("/api/gen-docx", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(requestBody)
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

      const createdJobId = response.headers.get("x-job-id");
      router.push(createdJobId ? `/dashboard/${createdJobId}` : "/dashboard");
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
    <main className={styles.page}>
      <div className={styles.container}>
        <div className={styles.header}>
          <h1>Generate DOCX</h1>
          <p>กรอกข้อมูลเอกสารให้ครบถ้วนเพื่อสร้างไฟล์ Word อัตโนมัติ</p>
          {editingJobId ? (
            <div className={styles.editingBanner}>
              <span className={styles.editingBadge}>Editing existing job</span>
              <Link href="/dashboard" className={styles.backLink}>
                ← Back to Dashboard
              </Link>
            </div>
          ) : null}
        </div>

        {loadingJob ? <p className={styles.loadingText}>กำลังโหลดข้อมูลงานเดิม...</p> : null}

        <form onSubmit={handleSubmit} className={styles.layout}>
          <div className={styles.mainColumn}>
            <section className={styles.card}>
              <h2 className={styles.sectionTitle}>ข้อมูลเรื่อง</h2>
              <div className={styles.grid2}>
                <div className={styles.field}>
                  <label htmlFor="department">แผนก</label>
                  <input
                    id="department"
                    name="department"
                    type="text"
                    value={department}
                    onChange={(event) => setDepartment(event.target.value)}
                  />
                  {validationErrors.department && <p className={styles.fieldError}>{validationErrors.department}</p>}
                </div>

                <div className={styles.field}>
                  <label htmlFor="subject">เรื่อง</label>
                  <input
                    id="subject"
                    name="subject"
                    type="text"
                    value={subject}
                    onChange={(event) => setSubject(event.target.value)}
                    placeholder="กรอกชื่อเรื่อง"
                  />
                  {validationErrors.subject && <p className={styles.fieldError}>{validationErrors.subject}</p>}
                </div>
              </div>

              <div className={styles.field}>
                <label htmlFor="subject_detail">รายละเอียดเรื่อง</label>
                <textarea
                  id="subject_detail"
                  name="subject_detail"
                  rows={3}
                  value={subjectDetail}
                  onChange={(event) => setSubjectDetail(event.target.value)}
                />
              </div>

              <div className={styles.field}>
                <label htmlFor="purpose">เพื่อ</label>
                <textarea
                  id="purpose"
                  name="purpose"
                  rows={3}
                  value={purpose}
                  onChange={(event) => setPurpose(event.target.value)}
                />
                {validationErrors.purpose && <p className={styles.fieldError}>{validationErrors.purpose}</p>}
              </div>
            </section>

            <section className={styles.card}>
              <h2 className={styles.sectionTitle}>งบประมาณ/เอกสาร</h2>
              <div className={styles.grid2}>
                <div className={`${styles.field} ${styles.fullWidth}`}>
                  <label htmlFor="budget_amount">วงเงิน</label>
                  <input
                    id="budget_amount"
                    name="budget_amount"
                    type="text"
                    value={budgetAmount}
                    onChange={(event) => setBudgetAmount(event.target.value)}
                  />
                  {validationErrors.budgetAmount && <p className={styles.fieldError}>{validationErrors.budgetAmount}</p>}
                </div>
                <div className={styles.field}>
                  <label htmlFor="receipt_no">เลขที่ใบเสร็จ</label>
                  <input
                    id="receipt_no"
                    name="receipt_no"
                    type="text"
                    value={receiptNo}
                    onChange={(event) => setReceiptNo(event.target.value)}
                    placeholder="เช่น INV-2024-001"
                  />
                  {validationErrors.receiptNo && <p className={styles.fieldError}>{validationErrors.receiptNo}</p>}
                </div>
                <div className={styles.field}>
                  <label htmlFor="approved_by">อนุมัติผ่าน</label>
                  <input
                    id="approved_by"
                    name="approved_by"
                    type="text"
                    value={approvedBy}
                    onChange={(event) => setApprovedBy(event.target.value)}
                    placeholder="เช่น ผู้จัดการการไฟฟ้า"
                  />
                  {validationErrors.approvedBy && <p className={styles.fieldError}>{validationErrors.approvedBy}</p>}
                </div>
              </div>

              <div className={styles.field}>
                <label htmlFor="vendor_name">บริษัท / ห้างหุ้นส่วนจำกัด / ร้าน</label>
                <input
                  id="vendor_name"
                  name="vendor_name"
                  type="text"
                  value={vendorName}
                  onChange={(event) => setVendorName(event.target.value)}
                  placeholder="เช่น บริษัท ABC จำกัด"
                />
                {validationErrors.vendorName && <p className={styles.fieldError}>{validationErrors.vendorName}</p>}
              </div>

              <div className={styles.field}>
                <label htmlFor="vendor_address">ที่อยู่</label>
                <textarea
                  id="vendor_address"
                  name="vendor_address"
                  rows={3}
                  value={vendorAddress}
                  onChange={(event) => setVendorAddress(event.target.value)}
                  placeholder="ที่อยู่ตามใบเสร็จ"
                />
                {validationErrors.vendorAddress && <p className={styles.fieldError}>{validationErrors.vendorAddress}</p>}
              </div>

              <div className={styles.grid2}>
                <div className={styles.field}>
                  <label htmlFor="assignee">ผู้ได้รับมอบหมาย</label>
                  <input
                    id="assignee"
                    name="assignee"
                    type="text"
                    value={assignee}
                    onChange={(event) => setAssignee(event.target.value)}
                  />
                </div>
                <div className={styles.field}>
                  <label htmlFor="assignee_position">ตำแหน่งผู้ได้รับมอบหมาย</label>
                  <input
                    id="assignee_position"
                    name="assignee_position"
                    type="text"
                    value={assigneePosition}
                    onChange={(event) => setAssigneePosition(event.target.value)}
                    placeholder="เช่น ผู้ช่วยช่าง, ช่าง, วิศวกร"
                  />
                </div>
              </div>
            </section>

            <section className={styles.card}>
              <div className={styles.sectionHead}>
                <h2 className={styles.sectionTitle}>รายละเอียดวัสดุ</h2>
                <button type="button" className={styles.secondaryButton} onClick={addItem}>
                  + เพิ่มรายการ
                </button>
              </div>

              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>ลำดับ</th>
                      <th>ชื่อวัสดุ</th>
                      <th>จำนวน</th>
                      <th>หน่วย</th>
                      <th>ราคาต่อหน่วย (รวม VAT)</th>
                      <th>ราคารวม</th>
                      <th>คุณลักษณะ (spec)</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, index) => (
                      <tr key={`item-${index}`}>
                        <td>
                          <input id={`item-no-${index}`} type="text" value={index + 1} readOnly />
                        </td>
                        <td>
                          <input
                            id={`item-name-${index}`}
                            type="text"
                            value={item.name}
                            onChange={(event) => updateItem(index, "name", event.target.value)}
                          />
                        </td>
                        <td>
                          <input
                            id={`item-qty-${index}`}
                            type="text"
                            value={item.qty}
                            onChange={(event) => updateItem(index, "qty", event.target.value)}
                          />
                        </td>
                        <td>
                          <input
                            id={`item-unit-${index}`}
                            type="text"
                            value={item.unit}
                            onChange={(event) => updateItem(index, "unit", event.target.value)}
                          />
                        </td>
                        <td>
                          <input
                            id={`item-price-${index}`}
                            type="text"
                            value={item.price}
                            onChange={(event) => updateItem(index, "price", event.target.value)}
                          />
                        </td>
                        <td className={styles.totalCell}>{formatMoney(itemTotal(item))}</td>
                        <td>
                          <details>
                            <summary className={styles.summaryToggle}>เปิด/ซ่อน</summary>
                            <textarea
                              id={`item-spec-${index}`}
                              rows={3}
                              value={item.spec}
                              onChange={(event) => updateItem(index, "spec", event.target.value)}
                            />
                          </details>
                        </td>
                        <td>
                          <button
                            type="button"
                            className={styles.removeButton}
                            onClick={() => removeItem(index)}
                          >
                            ลบ
                          </button>
                          {validationErrors.items?.[index] && (
                            <p className={styles.fieldError}>{validationErrors.items[index]}</p>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <button type="button" className={styles.secondaryButtonBottom} onClick={addItem}>
                + เพิ่มรายการ
              </button>
            </section>

            <section className={`${styles.card} ${styles.summaryBottomCard}`}>
              <h3 className={styles.summaryTitle}>สรุปยอด</h3>
              <div className={styles.summaryBottomGrid}>
                <div className={styles.summaryBottom}>
                  <dl className={styles.summaryList}>
                    <div className={styles.summaryRow}>
                      <dt className={styles.summaryLabel}>ราคาสินค้า (ก่อน VAT)</dt>
                      <dd className={styles.summaryValue}>{formatMoney(subtotalNet)}</dd>
                    </div>
                    <div className={styles.summaryRow}>
                      <dt className={styles.summaryLabel}>VAT 7%</dt>
                      <dd className={styles.summaryValue}>{formatMoney(vatAmount)}</dd>
                    </div>
                    <div className={`${styles.summaryRow} ${styles.totalRow}`}>
                      <dt className={styles.summaryLabel}>รวมสุทธิ</dt>
                      <dd className={`${styles.summaryValue} ${styles.grandTotalValue}`}>{formatMoney(grandTotal)}</dd>
                    </div>
                  </dl>
                  <p className={styles.totalText}>{readThaiBaht(grandTotal)}</p>
                </div>

                <div className={styles.summaryActions}>
                  <label className={styles.toggleRow}>
                    <span>VAT included mode</span>
                    <input type="checkbox" checked={vatIncluded} readOnly aria-label="VAT included mode" />
                  </label>

                  <button type="submit" className={styles.primaryButton} disabled={loading}>
                    {loading ? (
                      <span className={styles.spinnerWrap}>
                        <span className={styles.spinner} aria-hidden /> กำลังสร้างไฟล์...
                      </span>
                    ) : (
                      editingJobId ? "บันทึกและ Generate ใหม่" : "Generate DOCX"
                    )}
                  </button>
                  <button type="button" className={styles.resetButton} onClick={resetForm}>
                    ล้างข้อมูล
                  </button>
                </div>
              </div>

              {error && <pre className={styles.error}>{error}</pre>}
            </section>
          </div>
        </form>
      </div>
    </main>
  );
}
