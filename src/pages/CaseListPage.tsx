import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import { listCases } from '../lib/caseStore';

const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(new Date(value));

export default function CaseListPage() {
  const cases = useMemo(() => listCases(), []);

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

      {cases.length === 0 ? (
        <div className="card">
          <h3>ยังไม่มีเคส</h3>
          <p className="hint">เริ่มต้นสร้าง draft ใหม่เพื่อจัดการข้อมูลงานจัดซื้อจัดจ้าง</p>
        </div>
      ) : (
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
              {cases.map((item) => (
                <tr key={item.id}>
                  <td>{item.case_no}</td>
                  <td>{item.title || '-'}</td>
                  <td>{item.department || '-'}</td>
                  <td>{formatDateTime(item.updated_at)}</td>
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
      )}
    </section>
  );
}
