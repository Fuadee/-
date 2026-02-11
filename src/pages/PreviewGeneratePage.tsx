import { Link, useParams } from 'react-router-dom';
import PageHeader from '../components/PageHeader';

export default function PreviewGeneratePage() {
  const params = useParams();
  const caseId = params.id ?? 'CASE-2025-001';

  return (
    <section>
      <PageHeader
        title={`Preview / Generate: ${caseId}`}
        subtitle="ตรวจข้อมูลก่อนสร้างเอกสาร .docx"
      />

      <div className="card preview-grid">
        <div>
          <h3>ข้อมูลหัวเคส</h3>
          <ul>
            <li><strong>ชื่อเรื่อง:</strong> จัดซื้อวัสดุสำนักงานประจำไตรมาส 1</li>
            <li><strong>หน่วยงาน:</strong> กองคลัง</li>
            <li><strong>วันที่:</strong> 11/02/2026</li>
            <li><strong>ผู้ขาย:</strong> บริษัท เอ บี ซี จำกัด</li>
          </ul>
        </div>

        <div>
          <h3>Template</h3>
          <label>
            เลือกเทมเพลต
            <select defaultValue="procurement_notice_v1">
              <option value="procurement_notice_v1">procurement_notice_v1</option>
              <option value="purchase_order_v1">purchase_order_v1</option>
            </select>
          </label>
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
            <tr>
              <td>1</td>
              <td>กระดาษ A4 80 แกรม</td>
              <td>10</td>
              <td>รีม</td>
              <td>120</td>
              <td>1,200</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3>ไฟล์แนบ</h3>
        <ul>
          <li>quotation-abc.pdf</li>
          <li>receipt-photo-01.jpg</li>
        </ul>
      </div>

      <div className="footer-actions">
        <Link className="btn-secondary" to={`/cases/${caseId}/edit`}>
          กลับไปแก้ไข
        </Link>
        <button className="btn-primary" type="button">Generate .docx</button>
      </div>
    </section>
  );
}
