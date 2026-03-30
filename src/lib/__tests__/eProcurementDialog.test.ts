import test from "node:test";
import assert from "node:assert/strict";

import { mapProjectionRowToJobRecord, type DashboardProjectionRow } from "../dashboardProjection.ts";
import { buildEProcurementDialogState, parseJobPayloadForDialog } from "../eProcurementDialog.ts";

test("API transform: projection row -> client job row keeps expected fields", () => {
  const row: DashboardProjectionRow = {
    job_id: "123",
    user_id: "u-1",
    title: "งานทดสอบ",
    normalized_status: "pending_approval",
    raw_status: "pending_approval",
    is_completed: false,
    is_active: true,
    created_at: "2026-03-30T00:00:00.000Z",
    updated_at: "2026-03-30T00:00:00.000Z",
    created_by: "u-1",
    requester_name: "req",
    created_by_name: "Requester",
    assignee_name: "Assignee",
    department: "IT",
    tax_id: "0012345678901",
    job_code: "JOB-00123",
    search_text: "งานทดสอบ"
  };

  const mapped = mapProjectionRowToJobRecord(row);

  assert.equal(mapped.id, "123");
  assert.equal(mapped.tax_id, "0012345678901");
  assert.equal(mapped.title, "งานทดสอบ");
  assert.equal(mapped.status, "pending_approval");
});

test("parse payload string -> object", () => {
  const parsed = parseJobPayloadForDialog('{"subject":"ซื้ออุปกรณ์","vendor_name":"ร้าน A"}');

  assert.equal(parsed.subject, "ซื้ออุปกรณ์");
  assert.equal(parsed.vendor_name, "ร้าน A");
});

test("handleStatusClick equivalent: build modal state from job payload string", () => {
  const dialog = buildEProcurementDialogState({
    id: "99",
    title: "งานซื้อ",
    status: "pending_approval",
    job: {
      return_from_status: "pending_review",
      tax_id: "0099999999999",
      payload: JSON.stringify({
        subject: "ซื้อครุภัณฑ์",
        subject_detail: "สำหรับใช้งานโครงการ",
        supplier_name: "บริษัท บี จำกัด",
        summary: { total: "12000" }
      })
    }
  });

  assert.equal(dialog.detailsText, "ซื้อครุภัณฑ์");
  assert.equal(dialog.vendorName, "บริษัท บี จำกัด");
  assert.equal(dialog.taxId, "0099999999999");
  assert.equal(dialog.grandTotal, 12000);
});

test("nested payload path ใหม่ถูกอ่านได้", () => {
  const dialog = buildEProcurementDialogState({
    id: "100",
    title: "งานจ้าง",
    status: "pending_approval",
    job: {
      payload: {
        procurement: {
          subject: "จ้างเหมาบริการ",
          vendor: { name: "หจก. ซี เซอร์วิส", tax_id: "0011111111111" },
          calculation: { total: "5350" }
        }
      }
    }
  });

  assert.equal(dialog.detailsText, "จ้างเหมาบริการ");
  assert.equal(dialog.vendorName, "หจก. ซี เซอร์วิส");
  assert.equal(dialog.taxId, "0011111111111");
  assert.equal(dialog.grandTotal, 5350);
});
