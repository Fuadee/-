import { formatMoneyTH, toNumber } from "@/lib/money";
import { buildPaymentBudgetDocText, normalizePaymentBudget, type PaymentBudget } from "@/lib/paymentBudget";
import { toThaiBahtText } from "@/lib/thaiBahtText";
import { calculateVatBreakdown, VAT_RATE_DECIMAL, type VatMode } from "@/lib/vat";

export type ItemPayload = {
  no?: number;
  name?: string;
  qty?: string | number;
  unit?: string;
  price?: string | number;
  spec?: string;
  total?: string | number;
};

export type GeneratePayload = {
  department?: string | null;
  subject?: string | null;
  subject_detail?: string | null;
  purpose?: string | null;
  budget_amount?: string | null;
  budget_source?: string | null;
  vendor_name?: string | null;
  tax_id?: string | null;
  vendor_address?: string | null;
  receipt_no?: string | null;
  receipt_date?: string | null;
  assignee?: string | null;
  assignee_position?: string | null;
  approved_by?: string | null;
  payment_method?: "credit" | "advance" | "loan" | null;
  assignee_emp_code?: string | null;
  loan_doc_no?: string | null;
  payment_budget?: PaymentBudget | null;
  items?: ItemPayload[] | null;
  vat_mode?: VatMode | null;
  vat_enabled?: boolean | null;
  vat_rate?: number | string | null;
};

const normalizeItems = (items: ItemPayload[] | null | undefined) => {
  if (!Array.isArray(items)) {
    return [];
  }

  return items.map((item, index) => {
    const qty = toNumber(item.qty);
    const price = toNumber(item.price);
    const totalInclVat = qty * price;

    return {
      no: index + 1,
      name: item.name ?? "",
      qty,
      unit: item.unit ?? "",
      price: formatMoneyTH(price),
      spec: item.spec ?? "",
      total: formatMoneyTH(totalInclVat),
      price_fmt: formatMoneyTH(price),
      total_fmt: formatMoneyTH(totalInclVat),
      qty_num: qty,
      price_num: price,
      total_num: totalInclVat
    };
  });
};

const roundForDisplay = (value: number) => Number(value.toFixed(2));

const toValidDate = (value: string | null | undefined): Date | null => {
  if (!value) {
    return null;
  }

  const parsedDate = new Date(value);
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
};

export const formatThaiDateBE = (value: string | null | undefined): string => {
  const date = toValidDate(value);
  if (!date) {
    return "";
  }

  const toBuddhistYear = (year: number) => year + 543;
  const thaiMonths = [
    "มกราคม",
    "กุมภาพันธ์",
    "มีนาคม",
    "เมษายน",
    "พฤษภาคม",
    "มิถุนายน",
    "กรกฎาคม",
    "สิงหาคม",
    "กันยายน",
    "ตุลาคม",
    "พฤศจิกายน",
    "ธันวาคม"
  ];

  const formatter = new Intl.DateTimeFormat("th-TH-u-ca-gregory-nu-latn", {
    day: "numeric",
    month: "numeric",
    year: "numeric"
  });

  const parts = formatter.formatToParts(date);
  const day = parts.find((part) => part.type === "day")?.value ?? "";
  const month = Number(parts.find((part) => part.type === "month")?.value ?? "0");
  const christianYear = Number(parts.find((part) => part.type === "year")?.value ?? "0");

  if (
    !day ||
    !Number.isFinite(month) ||
    month <= 0 ||
    month > thaiMonths.length ||
    !Number.isFinite(christianYear) ||
    christianYear <= 0
  ) {
    return "";
  }

  return `${day} ${thaiMonths[month - 1]} ${toBuddhistYear(christianYear)}`;
};

const buildReceiptNoDateLine = (receiptNo: string, receiptDateThai: string): string => {
  const hasReceiptNo = Boolean(receiptNo);
  const hasReceiptDate = Boolean(receiptDateThai);

  if (hasReceiptNo && hasReceiptDate) {
    return `เลขที่ใบเสร็จ ${receiptNo} ลงวันที่ ${receiptDateThai}`;
  }

  if (hasReceiptNo) {
    return `เลขที่ใบเสร็จ ${receiptNo}`;
  }

  if (hasReceiptDate) {
    return `ลงวันที่ ${receiptDateThai}`;
  }

  return "";
};

/**
 * แปลงชื่อแผนกสำหรับตำแหน่งผู้ช่วยหัวหน้าแผนก
 *
 * ตัวอย่าง:
 * - ผปบ.กฟจ.กระบี่ => หผ.ปบ.กฟจ.กระบี่
 * - ผกส.กฟจ.กระบี่ => หผ.กส.กฟจ.กระบี่
 * - หผ.ปบ.กฟจ.กระบี่ => หผ.ปบ.กฟจ.กระบี่
 * - "  ผปบ.กฟจ.กระบี่  " => หผ.ปบ.กฟจ.กระบี่
 * - "" / null / undefined => ""
 */
export const toAssistantHeadDeptLabel = (input?: string | null): string => {
  const trimmed = input?.trim() ?? "";

  if (!trimmed) {
    return "";
  }

  if (trimmed.startsWith("หผ.")) {
    return trimmed;
  }

  if (trimmed.startsWith("ผ")) {
    return `หผ.${trimmed.slice(1)}`;
  }

  return trimmed;
};

export const buildDocxTemplateData = (body: GeneratePayload) => {
  const receiptNo = body.receipt_no?.trim() ?? "";
  const receiptDate = formatThaiDateBE(body.receipt_date);
  const approvedByRaw = body.approved_by?.trim() ?? "";
  const approvedByLine = approvedByRaw ? `ผ่าน ${approvedByRaw}` : "";
  const paymentBudget = normalizePaymentBudget(body.payment_budget);
  const paymentBudgetDocText = paymentBudget?.doc_text || buildPaymentBudgetDocText({
    type: body.payment_budget?.type,
    org_label: body.payment_budget?.org_label,
    cost_center: body.payment_budget?.cost_center,
    po_no: body.payment_budget?.po_no,
    network_no: body.payment_budget?.network_no,
    account_code: body.payment_budget?.account_code,
    account_name: body.payment_budget?.account_name
  });
  const normalizedItems = normalizeItems(body.items);
  const paymentMethod = body.payment_method ?? "credit";
  const assigneeEmpCode = body.assignee_emp_code?.trim() ?? "";
  const loanDocNo = body.loan_doc_no?.trim() ?? "";
  const vatMode: VatMode =
    body.vat_mode === "included" || body.vat_mode === "excluded" || body.vat_mode === "none"
      ? body.vat_mode
      : body.vat_enabled === false
        ? "none"
        : "included";
  const vatEnabled = vatMode !== "none";
  const vatRate = toNumber(body.vat_rate ?? 7);
  const vatRateDecimal = vatRate > 1 ? vatRate / 100 : vatRate || VAT_RATE_DECIMAL;

  const items = normalizedItems.map((item) => {
    const breakdown = calculateVatBreakdown(item.total_num, vatMode, vatRateDecimal);
    const itemLineTotalBase = breakdown.base;
    const itemLineTotalIncluded = breakdown.total;
    const itemVatAmount = breakdown.vat;
    const itemUnitPriceBase = item.qty_num > 0 ? itemLineTotalBase / item.qty_num : 0;
    const itemUnitPriceIncluded = item.qty_num > 0 ? itemLineTotalIncluded / item.qty_num : 0;
    const shouldDisplayIncludedLine = vatMode === "included";

    const lineTotalNum = shouldDisplayIncludedLine ? itemLineTotalIncluded : itemLineTotalBase;
    const unitPriceNum = shouldDisplayIncludedLine ? itemUnitPriceIncluded : itemUnitPriceBase;

    return {
      ...item,
      item_unit_price_base: itemUnitPriceBase,
      item_line_total_base: itemLineTotalBase,
      item_unit_price_included: itemUnitPriceIncluded,
      item_line_total_included: itemLineTotalIncluded,
      unit_price_num: unitPriceNum,
      line_total_num: lineTotalNum,
      total_net_num: itemLineTotalBase,
      vat_amount_num: itemVatAmount,
      total_num: itemLineTotalIncluded,
      price: formatMoneyTH(roundForDisplay(unitPriceNum)),
      price_fmt: formatMoneyTH(roundForDisplay(unitPriceNum)),
      total: formatMoneyTH(roundForDisplay(lineTotalNum)),
      total_fmt: formatMoneyTH(roundForDisplay(lineTotalNum)),
      line_total_fmt: formatMoneyTH(roundForDisplay(lineTotalNum)),
      total_net_fmt: formatMoneyTH(roundForDisplay(itemLineTotalBase)),
      vat_amount_fmt: formatMoneyTH(roundForDisplay(itemVatAmount)),
      item_unit_price_base_fmt: formatMoneyTH(roundForDisplay(itemUnitPriceBase)),
      item_line_total_base_fmt: formatMoneyTH(roundForDisplay(itemLineTotalBase)),
      item_unit_price_included_fmt: formatMoneyTH(roundForDisplay(itemUnitPriceIncluded)),
      item_line_total_included_fmt: formatMoneyTH(roundForDisplay(itemLineTotalIncluded))
    };
  });

  const subtotalNet = items.reduce((sum, item) => sum + item.total_net_num, 0);
  const vatAmountTotal = items.reduce((sum, item) => sum + item.vat_amount_num, 0);
  const grandTotal = items.reduce((sum, item) => sum + item.total_num, 0);
  const subtotalInclVat = grandTotal;

  const subtotalInclVatDisplay = roundForDisplay(subtotalInclVat);
  const subtotalNetDisplay = roundForDisplay(subtotalNet);
  const vatAmountDisplay = roundForDisplay(vatAmountTotal);
  const grandTotalDisplay = roundForDisplay(grandTotal);
  const vatNote = vatEnabled ? "รวมภาษีมูลค่าเพิ่ม" : "ไม่รวมภาษีมูลค่าเพิ่ม";
  const subject = body.subject ?? "";
  const vendorName = body.vendor_name ?? "";
  const assignee = body.assignee ?? "";
  const department = body.department?.trim() ?? "";
  const assistantHeadDepartment = toAssistantHeadDeptLabel(body.department);
  const grandTotalFmt = formatMoneyTH(grandTotalDisplay);
  const grandTotalText = toThaiBahtText(grandTotalDisplay);

  let paymentDetailText = `จึงเรียนมาเพื่อโปรดทราบ และขออนุมัติเบิกจ่ายค่าซื้อ ${subject} เป็นเงิน ${grandTotalFmt} บาท (${grandTotalText}) (${vatNote}) ให้กับ ร้าน/บริษัท ${vendorName} ต่อไป`;

  if (paymentMethod === "advance") {
    paymentDetailText = `จึงเรียนมาเพื่อโปรดทราบ และขออนุมัติเบิกจ่ายค่าซื้อ ${subject} เป็นเงิน ${grandTotalFmt} บาท (${grandTotalText}) (${vatNote}) ให้กับ ${assignee} (${assigneeEmpCode}) เนื่องจากได้สำรองจ่ายเงินค่าซื้อฯ ดังกล่าวไปก่อนแล้ว`;
  }

  if (paymentMethod === "loan") {
    paymentDetailText = `จึงเรียนมาเพื่อโปรดทราบ และขอให้ ผสน.กฟจ.กระบี่ หักล้างเงินยืมตามใบสำคัญจ่ายเลขที่ ${loanDocNo} ต่อไป`;
  }

  return {
    department,
    dept_asst_head: assistantHeadDepartment,
    subject: body.subject ?? "",
    subject_detail: body.subject_detail ?? "",
    purpose: body.purpose ?? "",
    budget_amount: body.budget_amount ?? "",
    budget_source: body.budget_source ?? "",
    vendor_name: body.vendor_name ?? "",
    tax_id: body.tax_id ?? "",
    vendor_tax_id: body.tax_id ?? "",
    vendor_address: body.vendor_address ?? "",
    receipt_no: receiptNo,
    receipt_date: receiptDate,
    receipt_no_date_line: buildReceiptNoDateLine(receiptNo, receiptDate),
    assignee: body.assignee ?? "",
    assignee_position: body.assignee_position ?? "",
    approved_by: approvedByLine,
    approved_by_raw: approvedByRaw,
    approved_by_line: approvedByLine,
    payment_method: paymentMethod,
    assignee_emp_code: assigneeEmpCode,
    loan_doc_no: loanDocNo,
    payment_detail_text: paymentDetailText,
    payment_budget: paymentBudget,
    pay_text: paymentBudget?.doc_text ?? paymentBudgetDocText,
    items,
    vat_mode: vatMode,
    vat_enabled: vatEnabled,
    vat_rate: vatRate,
    vat_rate_percent: `${vatRate}%`,
    subtotal: subtotalInclVat,
    subtotal_incl_vat: subtotalInclVat,
    subtotal_net: subtotalNet,
    vat_amount: vatAmountTotal,
    grand_total: grandTotal,
    subtotal_fmt: formatMoneyTH(subtotalInclVatDisplay),
    subtotal_incl_vat_fmt: formatMoneyTH(subtotalInclVatDisplay),
    subtotal_before_vat: subtotalNet,
    subtotal_before_vat_fmt: formatMoneyTH(subtotalNetDisplay),
    subtotal_net_fmt: formatMoneyTH(subtotalNetDisplay),
    vat_amount_fmt: formatMoneyTH(vatAmountDisplay),
    grand_total_fmt: grandTotalFmt,
    grand_total_text: grandTotalText
  };
};
