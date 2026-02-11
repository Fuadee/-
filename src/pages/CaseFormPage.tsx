import { Link, useParams } from 'react-router-dom';
import PageHeader from '../components/PageHeader';

interface CaseFormPageProps {
  mode: 'create' | 'edit';
}

export default function CaseFormPage({ mode }: CaseFormPageProps) {
  const params = useParams();
  const caseId = params.id ?? 'CASE-NEW';

  return (
    <section>
      <PageHeader
        title={mode === 'create' ? 'Create Case' : `Edit Case: ${caseId}`}
        subtitle="โครงฟอร์มสำหรับบันทึกข้อมูลเคส / รายการจัดซื้อ / ไฟล์แนบ"
      />

      <div className="card form-grid">
        <label>
          ชื่อเรื่อง
          <input type="text" placeholder="เช่น จัดซื้อวัสดุสำนักงาน" />
        </label>
        <label>
          วันที่คำขอ
          <input type="date" />
        </label>
        <label>
          หน่วยงาน
          <input type="text" placeholder="กองคลัง" />
        </label>
        <label>
          ผู้ขอ
          <input type="text" placeholder="สมชาย ใจดี" />
        </label>
        <label>
          ผู้ขาย
          <input type="text" placeholder="บริษัท เอ บี ซี จำกัด" />
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
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>1</td>
              <td><input type="text" placeholder="กระดาษ A4 80 แกรม" /></td>
              <td><input type="number" defaultValue={10} /></td>
              <td><input type="text" defaultValue="รีม" /></td>
              <td><input type="number" defaultValue={120} /></td>
              <td>1,200</td>
            </tr>
          </tbody>
        </table>
        <button className="btn-secondary" type="button">+ เพิ่มรายการ</button>
      </div>

      <div className="card">
        <h3>ไฟล์แนบ</h3>
        <input type="file" multiple />
        <p className="hint">รองรับไฟล์ .jpg .png .pdf (สูงสุดไฟล์ละ 10MB)</p>
      </div>

      <div className="footer-actions">
        <button className="btn-secondary" type="button">บันทึก Draft</button>
        <Link className="btn-primary" to={`/cases/${caseId}/preview`}>
          ไปหน้า Preview
        </Link>
      </div>
    </section>
  );
}
