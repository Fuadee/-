import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import { clearAllCases, deleteCases, listCases } from '../lib/caseStore';

const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(new Date(value));

export default function CaseListPage() {
  const [cases, setCases] = useState(() => listCases());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setCases(listCases());
  }, []);

  const allSelected = useMemo(
    () => cases.length > 0 && cases.every((item) => selectedIds.has(item.id)),
    [cases, selectedIds]
  );

  const selectedCount = selectedIds.size;

  const onToggleSelectAll = (checked: boolean) => {
    if (!checked) {
      setSelectedIds(new Set());
      return;
    }

    setSelectedIds(new Set(cases.map((item) => item.id)));
  };

  const onToggleSelect = (id: string, checked: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current);

      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }

      return next;
    });
  };

  const refreshCases = () => {
    setCases(listCases());
    setSelectedIds(new Set());
  };

  const onDeleteSelected = () => {
    if (selectedIds.size === 0) return;

    const confirmed = window.confirm(`ยืนยันลบ ${selectedIds.size} เคสที่เลือก?`);
    if (!confirmed) return;

    deleteCases(Array.from(selectedIds));
    refreshCases();
  };

  const onClearAllCases = () => {
    if (cases.length === 0) return;

    const token = window.prompt('พิมพ์ DELETE เพื่อยืนยันการล้างเคสทั้งหมด');
    if (token !== 'DELETE') {
      return;
    }

    clearAllCases();
    refreshCases();
  };

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
          <div className="list-toolbar">
            <span className="hint">เลือกแล้ว {selectedCount} เคส</span>
            <div className="toolbar-actions">
              <button type="button" className="btn-secondary" onClick={onDeleteSelected} disabled={selectedCount === 0}>
                ลบที่เลือก
              </button>
              <button type="button" className="btn-danger" onClick={onClearAllCases}>
                ล้างเคสทั้งหมด
              </button>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={(event) => onToggleSelectAll(event.target.checked)}
                    aria-label="เลือกทั้งหมด"
                  />
                </th>
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
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(item.id)}
                      onChange={(event) => onToggleSelect(item.id, event.target.checked)}
                      aria-label={`เลือกเคส ${item.case_no}`}
                    />
                  </td>
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
