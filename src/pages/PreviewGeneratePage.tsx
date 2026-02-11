import { Link, useParams } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import { getCase } from '../lib/caseStore';

export default function PreviewGeneratePage() {
  const params = useParams();
  const caseId = params.id;
  const data = caseId ? getCase(caseId) : null;

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

      <div className="footer-actions">
        <Link className="btn-secondary" to={`/cases/${data.id}/edit`}>
          กลับไปแก้ไข
        </Link>
        <button className="btn-primary" type="button">
          Generate .docx
        </button>
      </div>
    </section>
  );
}
