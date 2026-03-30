import test from "node:test";
import assert from "node:assert/strict";

import {
  getEProcurementCardData,
  getEProcurementSummary,
  getEProcurementTaxId,
  getEProcurementTotalInclVat
} from "../eProcurementFields.ts";

test("schema ใหม่มี field ครบ: map ได้ครบทุกค่า", () => {
  const payload = {
    subject: "ซื้อวัสดุสำนักงาน",
    subject_detail: "เพื่อใช้งานในแผนกบัญชี",
    total: 5350,
    vendor_name: "บริษัท เอ จำกัด",
    tax_id: "0123456789012"
  };

  const result = getEProcurementCardData(payload);

  assert.equal(result.summary.value, "ซื้อวัสดุสำนักงาน");
  assert.equal(result.vendorName.value, "บริษัท เอ จำกัด");
  assert.equal(result.taxId.value, "0123456789012");
  assert.equal(result.totalInclVat.value, 5350);
});

test("schema ใหม่ขาดบาง field แต่ fallback ยังใช้งานได้", () => {
  const payload = {
    case_title: "จ้างบริการบำรุงรักษา",
    supplier_name: "หจก. บี เซอร์วิส",
    vendor_tax_id: "0011223344556",
    summary: {
      total: "12840"
    }
  };

  const result = getEProcurementCardData(payload);

  assert.equal(result.summary.value, "จ้างบริการบำรุงรักษา");
  assert.equal(result.vendorName.value, "หจก. บี เซอร์วิส");
  assert.equal(result.taxId.value, "0011223344556");
  assert.equal(result.totalInclVat.value, 12840);
});

test("VAT included: total incl VAT ถูกต้อง", () => {
  const total = getEProcurementTotalInclVat({
    vat_mode: "included",
    items: [
      { total: 1070 },
      { total: 2140 }
    ]
  });

  assert.equal(total.value, 3210);
});

test("VAT excluded: คำนวณ total incl VAT ได้ถูกต้อง", () => {
  const total = getEProcurementTotalInclVat({
    vat_mode: "excluded",
    vat_rate: 7,
    items: [
      { total: 1000 },
      { total: 2000 }
    ]
  });

  assert.equal(total.value, 3210);
});

test("tax_id เป็น string ที่ขึ้นต้น 0 ต้องไม่หาย", () => {
  const taxId = getEProcurementTaxId({ tax_id: "0012345678901" });
  assert.equal(taxId.value, "0012345678901");
});

test("summary/vendor/total ไม่ตกเป็นค่าว่างถ้ามี field ให้ fallback", () => {
  const summary = getEProcurementSummary({ name: "เช่ารถยนต์" });
  const data = getEProcurementCardData({ selected_vendor: "ร้าน C", grand_total: "9999" });

  assert.equal(summary.value, "เช่ารถยนต์");
  assert.equal(data.vendorName.value, "ร้าน C");
  assert.equal(data.totalInclVat.value, 9999);
});

test("summary ต้องใช้ subject อย่างเดียวแม้มี subject_detail", () => {
  const summary = getEProcurementSummary({
    subject: "ซื้อคอมพิวเตอร์",
    subject_detail: "สำหรับใช้งานสำนักงาน"
  });

  assert.equal(summary.value, "ซื้อคอมพิวเตอร์");
});

test("summary fallback เป็น title เมื่อไม่มี subject", () => {
  const summary = getEProcurementSummary({
    title: "งาน title"
  });

  assert.equal(summary.value, "งาน title");
});

test("summary fallback เป็น case_title เมื่อไม่มี subject/title", () => {
  const summary = getEProcurementSummary({
    case_title: "งาน case title"
  });

  assert.equal(summary.value, "งาน case title");
});

test("summary ไม่มีทั้ง 4 ค่า ต้องเป็นค่าว่าง (UI จะแสดง '-')", () => {
  const summary = getEProcurementSummary({
    subject_detail: "ห้ามใช้",
    purpose: "ห้ามใช้"
  });

  assert.equal(summary.value, "");
});
