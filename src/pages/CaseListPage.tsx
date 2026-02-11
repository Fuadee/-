import { Link } from 'react-router-dom';
import PageHeader from '../components/PageHeader';

const mockCases = [
  {
    id: 'CASE-2025-001',
    title: 'จัดซื้อวัสดุสำนักงานประจำไตรมาส 1',
    department: 'กองคลัง',
    updatedAt: '11/02/2026 10:45',
    status: 'draft'
  },
  {
    id: 'CASE-2025-002',
    title: 'จัดจ้างบำรุงรักษาเครื่องปรับอากาศ',
    department: 'อาคารสถานที่',
    updatedAt: '10/02/2026 15:20',
    status: 'generated'
  }
];

export default function CaseListPage() {
  return (
    <section>
      <PageHeader
        title="Case List"
        subtitle="ภาพรวมเคสจัดซื้อจัดจ้างล่าสุด"
        actions={
          <Link className="btn-primary" to="/cases/new">
            + สร้างเคสใหม่
          </Link>
        }
      />

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Case No.</th>
              <th>ชื่อเคส</th>
              <th>หน่วยงาน</th>
              <th>อัปเดตล่าสุด</th>
              <th>สถานะ</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {mockCases.map((item) => (
              <tr key={item.id}>
                <td>{item.id}</td>
                <td>{item.title}</td>
                <td>{item.department}</td>
                <td>{item.updatedAt}</td>
                <td>
                  <span className={`badge ${item.status}`}>{item.status}</span>
                </td>
                <td>
                  <div className="row-actions">
                    <Link to={`/cases/${item.id}/edit`}>แก้ไข</Link>
                    <Link to={`/cases/${item.id}/preview`}>Preview</Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
