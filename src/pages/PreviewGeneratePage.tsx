import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import { apiUrl, getApiBaseUrl } from '../lib/api';
import { getCase } from '../lib/caseStore';

interface TemplateSummary {
  template_code: string;
  name: string;
}

interface DocxtemplaterErrorDetail {
  id?: string;
  explanation?: string;
  xtag?: string;
  context?: string;
}

interface DebugGenerateResponse {
  ok?: boolean;
  message?: string;
  docxtemplater_errors?: DocxtemplaterErrorDetail[];
  [key: string]: unknown;
}

const toFriendlyApiError = (error: unknown, endpoint: string) => {
  const fallback = `เรียก ${endpoint} ไม่ได้`;

  if (error instanceof TypeError) {
    return `backend ไม่ตอบสนอง: ${fallback} (ตรวจ API base URL: ${getApiBaseUrl()} และ backend ว่ากำลังรันอยู่)`;
  }

  if (error instanceof Error) {
    return `${fallback}: ${error.message}`;
  }

  return fallback;
};

export default function PreviewGeneratePage() {
  const params = useParams();
  const caseId = params.id;
  const data = caseId ? getCase(caseId) : null;

  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [selectedTemplateCode, setSelectedTemplateCode] = useState('');
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [debugResult, setDebugResult] = useState<DebugGenerateResponse | null>(null);
  const [debugGenerating, setDebugGenerating] = useState(false);

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
          setErrorMessage(toFriendlyApiError(error, '/api/templates'));
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
    setDebugResult(null);

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
      setErrorMessage(toFriendlyApiError(error, '/api/generate-docx'));
    } finally {
      setGenerating(false);
    }
  };

  const onDebugGenerateDocx = async () => {
    if (!selectedTemplateCode) {
      setErrorMessage('กรุณาเลือก template');
      return;
    }

    setDebugGenerating(true);
    setErrorMessage('');

    try {
      const response = await fetch(apiUrl('/api/generate-docx?debug=1'), {
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

      const payload = (await response.json().catch(() => null)) as DebugGenerateResponse | null;

      if (!response.ok) {
        setDebugResult(
          payload || {
            ok: false,
            message: `Debug generate ล้มเหลว (HTTP ${response.status})`
          }
        );

        return;
      }

      setDebugResult(payload || { ok: true, message: 'No debug payload returned' });
    } catch (error) {
      setErrorMessage(toFriendlyApiError(error, '/api/generate-docx?debug=1'));
      setDebugResult(null);
    } finally {
      setDebugGenerating(false);
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

        {debugResult ? (
          <div className="debug-output">
            <h4>Debug response</h4>
            <pre>{JSON.stringify(debugResult, null, 2)}</pre>

            {Array.isArray(debugResult.docxtemplater_errors) &&
            debugResult.docxtemplater_errors.length > 0 ? (
              <div>
                <p className="debug-errors-title">docxtemplater_errors</p>
                <ul className="debug-errors-list">
                  {debugResult.docxtemplater_errors.map((item, index) => (
                    <li key={`${item.id || 'unknown'}-${index}`}>
                      id: {item.id || '-'} | explanation: {item.explanation || '-'} | xtag/context:{' '}
                      {item.xtag || item.context || '-'}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="footer-actions">
        <Link className="btn-secondary" to={`/cases/${data.id}/edit`}>
          กลับไปแก้ไข
        </Link>
        <button
          className="btn-secondary"
          type="button"
          disabled={
            debugGenerating || generating || loadingTemplates || templates.length === 0
          }
          onClick={onDebugGenerateDocx}
        >
          {debugGenerating ? 'Debugging...' : 'Debug Generate'}
        </button>
        <button
          className="btn-primary"
          type="button"
          disabled={generating || debugGenerating || loadingTemplates || templates.length === 0}
          onClick={onGenerateDocx}
        >
          {generating ? 'Generating...' : 'Generate .docx'}
        </button>
      </div>
    </section>
  );
}
