import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import { createCase, getCase, saveCase } from '../lib/caseStore';
import type { AttachmentMeta, Case, CaseItem } from '../types';

interface CaseFormPageProps {
  mode: 'create' | 'edit';
}

const numberOrZero = (value: number) => (Number.isFinite(value) ? value : 0);
const createBlankItem = (): CaseItem => ({
  id: (typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `item-${Date.now()}`),
  description: '',
  quantity: 1,
  unit: '',
  unit_price: 0
});

export default function CaseFormPage({ mode }: CaseFormPageProps) {
  const params = useParams();
  const navigate = useNavigate();
  const [caseData, setCaseData] = useState<Case | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (mode === 'create') {
      setCaseData(createCase());
      return;
    }

    const caseId = params.id;
    if (!caseId) {
      setNotFound(true);
      return;
    }

    const existingCase = getCase(caseId);
    if (!existingCase) {
      setNotFound(true);
      return;
    }

    setCaseData(existingCase);
  }, [mode, params.id]);

  const subtotal = useMemo(
    () =>
      (caseData?.items ?? []).reduce(
        (acc, item) => acc + numberOrZero(item.quantity) * numberOrZero(item.unit_price),
        0
      ),
    [caseData?.items]
  );
  const tax = caseData?.vat_enabled ? subtotal * ((caseData.vat_rate || 0) / 100) : 0;
  const total = subtotal + tax;

  const updateField = <K extends keyof Case>(field: K, value: Case[K]) => {
    setCaseData((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  const updateItem = (id: string, patch: Partial<CaseItem>) => {
    setCaseData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        items: prev.items.map((item) => (item.id === id ? { ...item, ...patch } : item))
      };
    });
  };

  const addItem = () => {
    setCaseData((prev) => (prev ? { ...prev, items: [...prev.items, createBlankItem()] } : prev));
  };

  const removeItem = (id: string) => {
    setCaseData((prev) => {
      if (!prev) return prev;
      if (prev.items.length === 1) return prev;
      return {
        ...prev,
        items: prev.items.filter((item) => item.id !== id)
      };
    });
  };

  const onAttachmentSelected = (files: FileList | null) => {
    if (!files) return;
    const metas: AttachmentMeta[] = Array.from(files).map((file) => ({
      id: (typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `att-${Date.now()}`),
      name: file.name,
      size: file.size,
      mime_type: file.type
    }));
    updateField('attachments', metas);
  };

  const persistCase = () => {
    if (!caseData) return null;
    const saved = saveCase(caseData);
    setCaseData(saved);
    return saved;
  };

  if (notFound) {
    return (
      <section>
        <PageHeader title="ไม่พบเคส" subtitle="เคสที่ต้องการแก้ไขไม่มีอยู่ในระบบ localStorage" />
        <Link className="btn-secondary" to="/cases">
          กลับหน้ารายการ
        </Link>
      </section>
    );
  }

  if (!caseData) return null;

  return (
    <section>
      <PageHeader
        title={mode === 'create' ? `Create Case: ${caseData.case_no}` : `Edit Case: ${caseData.case_no}`}
        subtitle="กรอกข้อมูลเคส / รายการจัดซื้อ / ไฟล์แนบ แล้วบันทึกเป็น draft"
      />

      <div className="card form-grid">
        <label>
          ชื่อเรื่อง
          <input
            type="text"
            value={caseData.title}
            onChange={(event) => updateField('title', event.target.value)}
            placeholder="เช่น จัดซื้อวัสดุสำนักงาน"
          />
        </label>
        <label>
          วันที่คำขอ
          <input
            type="date"
            value={caseData.request_date}
            onChange={(event) => updateField('request_date', event.target.value)}
          />
        </label>
        <label>
          หน่วยงาน
          <input
            type="text"
            value={caseData.department}
            onChange={(event) => updateField('department', event.target.value)}
            placeholder="กองคลัง"
          />
        </label>
        <label>
          ผู้ขอ
          <input
            type="text"
            value={caseData.requester}
            onChange={(event) => updateField('requester', event.target.value)}
            placeholder="สมชาย ใจดี"
          />
        </label>
        <label>
          ผู้ขาย
          <input
            type="text"
            value={caseData.vendor}
            onChange={(event) => updateField('vendor', event.target.value)}
            placeholder="บริษัท เอ บี ซี จำกัด"
          />
        </label>
        <label>
          <span>VAT 7%</span>
          <input
            type="checkbox"
            checked={caseData.vat_enabled}
            onChange={(event) => updateField('vat_enabled', event.target.checked)}
          />
        </label>
      </div>

      <div className="card">
        <h3>รายการจัดซื้อ</h3>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>รายละเอียด</th>
              <th>จำนวน</th>
              <th>หน่วย</th>
              <th>ราคาต่อหน่วย</th>
              <th>รวม</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {caseData.items.map((item, index) => {
              const amount = numberOrZero(item.quantity) * numberOrZero(item.unit_price);
              return (
                <tr key={item.id}>
                  <td>{index + 1}</td>
                  <td>
                    <input
                      type="text"
                      value={item.description}
                      onChange={(event) => updateItem(item.id, { description: event.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min={0}
                      value={item.quantity}
                      onChange={(event) => updateItem(item.id, { quantity: Number(event.target.value) })}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      value={item.unit}
                      onChange={(event) => updateItem(item.id, { unit: event.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min={0}
                      value={item.unit_price}
                      onChange={(event) => updateItem(item.id, { unit_price: Number(event.target.value) })}
                    />
                  </td>
                  <td>{amount.toLocaleString('th-TH')}</td>
                  <td>
                    <button className="btn-secondary" type="button" onClick={() => removeItem(item.id)}>
                      ลบ
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <button className="btn-secondary" type="button" onClick={addItem}>
          + เพิ่มรายการ
        </button>
        <div className="totals">
          <p>Subtotal: {subtotal.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</p>
          <p>Tax ({caseData.vat_rate}%): {tax.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</p>
          <p>
            <strong>Total: {total.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</strong>
          </p>
        </div>
      </div>

      <div className="card">
        <h3>ไฟล์แนบ</h3>
        <input type="file" multiple onChange={(event) => onAttachmentSelected(event.target.files)} />
        <p className="hint">รองรับไฟล์ .jpg .png .pdf (สูงสุดไฟล์ละ 10MB)</p>
        {caseData.attachments.length > 0 && (
          <ul>
            {caseData.attachments.map((file) => (
              <li key={file.id}>{file.name}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="footer-actions">
        <button className="btn-secondary" type="button" onClick={persistCase}>
          บันทึก
        </button>
        <button
          className="btn-primary"
          type="button"
          onClick={() => {
            const saved = persistCase();
            if (!saved) return;
            navigate(`/cases/${saved.id}/preview`);
          }}
        >
          ไป Preview
        </button>
      </div>
    </section>
  );
}
