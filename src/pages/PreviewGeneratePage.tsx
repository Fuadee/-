import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import { apiUrl } from '../lib/api';
import { getCase } from '../lib/caseStore';

interface TemplateSummary {
  template_code: string;
  name: string;
}

export default function PreviewGeneratePage() {
  const params = useParams();
  const caseId = params.id;
  const data = caseId ? getCase(caseId) : null;

  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [selectedTemplateCode, setSelectedTemplateCode] = useState('');
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let isMounted = true;

    const loadTemplates = async () => {
      setLoadingTemplates(true);
      setErrorMessage('');

      try {
        const response = await fetch(apiUrl('/api/templates'));

        if (!response.ok) {
          throw new Error(`โหลด template ไม่สำเร็จ (HTTP ${response.status})`);
        }

        const result = (await response.json()) as TemplateSummary[];

        if (isMounted) {
          setTemplates(result);

          if (result.length > 0) {
            setSelectedTemplateCode(result[0].template_code);
          }
        }
      } catch (error) {
        if (isMounted) {
          const message = error instanceof Error ? error.message : 'โหลด template ไม่สำเร็จ';
          setErrorMessage(message);
        }
      } finally {
        if (isMounted) {
          setLoadingTemplates(false);
        }
      }
    };

    void loadTemplates();

    return () => {
      isMounted = false;
    };
  }, []);

  const attachmentsSummary = useMemo(() => {
    if (!data || data.attachments.length === 0) return 'ไม่มีไฟล์แนบ';
    return data.attachments.map((item) => item.name).join(', ');
  }, [data]);

  if (!data) {
    return (
      <section>
        <PageHeader title="ไม่พบเคส" subtitle="ไม่สามารถแสดงข้อมูล preview ได้" />
        <Link className="btn-secondary" to="/cases">
          กลับหน้ารายการ
        </Link>
      </section>
    );
  }

  const subtotal = data.items.reduce((acc, item) => acc + item.quantity * item.unit_price, 0);
  const tax = data.vat_enabled ? subtotal * ((data.vat_rate || 0) / 100) : 0;
  const total = subtotal + tax;

  const onGenerateDocx = async () => {
    if (!selectedTemplateCode) {
      setErrorMessage('กรุณาเลือก template');
      return;
    }

    setGenerating(true);
    setErrorMessage('');

    try {
      const response = await fetch(apiUrl('/api/generate-docx'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          template_code: selectedTemplateCode,
          case: data,
          items: data.items,
          attachments_summary: attachmentsSummary
        })
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(payload?.message || `สร้างไฟล์ไม่สำเร็จ (HTTP ${response.status})`);
      }

      const blob = await response.blob();
      const disposition = response.headers.get('Content-Disposition') || '';
      const filenameMatch = disposition.match(/filename="?([^";]+)"?/);
      const filename = filenameMatch?.[1] || `${data.case_no}_${selectedTemplateCode}.docx`;

      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = filename;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'สร้างไฟล์ .docx ไม่สำเร็จ';
      setErrorMessage(message);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <section>
      <PageHeader title={`Preview: ${data.case_no}`} subtitle="ตรวจข้อมูลก่อนสร้างเอกสาร .docx" />

      <div className="card preview-grid">
        <div>
          <h3>ข้อมูลหัวเคส</h3>
          <ul>
            <li>
              <strong>ชื่อเรื่อง:</strong> {data.title || '-'}
            </li>
            <li>
              <strong>หน่วยงาน:</strong> {data.department || '-'}
            </li>
            <li>
              <strong>วันที่:</strong> {data.request_date || '-'}
            </li>
            <li>
              <strong>ผู้ขอ:</strong> {data.requester || '-'}
            </li>
            <li>
              <strong>ผู้ขาย:</strong> {data.vendor || '-'}
            </li>
          </ul>
        </div>

        <div>
          <h3>สรุปยอด</h3>
          <ul>
            <li>Subtotal: {subtotal.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</li>
            <li>Tax ({data.vat_rate}%): {tax.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</li>
            <li>
              <strong>Total: {total.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</strong>
            </li>
          </ul>
        </div>
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
            </tr>
          </thead>
          <tbody>
            {data.items.map((item, index) => (
              <tr key={item.id}>
                <td>{index + 1}</td>
                <td>{item.description || '-'}</td>
                <td>{item.quantity}</td>
                <td>{item.unit || '-'}</td>
                <td>{item.unit_price.toLocaleString('th-TH')}</td>
                <td>{(item.quantity * item.unit_price).toLocaleString('th-TH')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3>ไฟล์แนบ</h3>
        {data.attachments.length === 0 ? (
          <p className="hint">ยังไม่มีไฟล์แนบ</p>
        ) : (
          <ul>
            {data.attachments.map((file) => (
              <li key={file.id}>{file.name}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <h3>Template สำหรับ Generate</h3>
        {loadingTemplates ? (
          <p className="hint">กำลังโหลด templates...</p>
        ) : templates.length === 0 ? (
          <p className="hint">ไม่พบ template</p>
        ) : (
          <label>
            เลือก template
            <select
              value={selectedTemplateCode}
              onChange={(event) => setSelectedTemplateCode(event.target.value)}
            >
              {templates.map((template) => (
                <option key={template.template_code} value={template.template_code}>
                  {template.name} ({template.template_code})
                </option>
              ))}
            </select>
          </label>
        )}

        {errorMessage ? <p className="error-text">{errorMessage}</p> : null}
      </div>

      <div className="footer-actions">
        <Link className="btn-secondary" to={`/cases/${data.id}/edit`}>
          กลับไปแก้ไข
        </Link>
        <button
          className="btn-primary"
          type="button"
          disabled={generating || loadingTemplates || templates.length === 0}
          onClick={onGenerateDocx}
        >
          {generating ? 'Generating...' : 'Generate .docx'}
        </button>
      </div>
    </section>
  );
}
