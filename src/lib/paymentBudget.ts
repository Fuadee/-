export type PaymentBudgetType = "operating" | "po" | "network";

export type PaymentBudget = {
  type: PaymentBudgetType;
  org_label?: string;
  cost_center?: string;
  po_no?: string;
  network_no?: string;
  account_code: string;
  account_name: string;
  doc_text: string;
};

export const OPERATING_ORG_OPTIONS = [
  { label: "กลุ่มบริหาร กฟจ.กระบี่", costCenter: "K3014101000" },
  { label: "แผนกบริการและลูกค้าสัมพันธ์", costCenter: "K304101010" },
  { label: "แผนกมิเตอร์และหม้อแปลง", costCenter: "k3041010202" },
  { label: "แผนกปฏิบัติการและบำรุงรักษาระบบไฟฟ้า", costCenter: "k304101030" },
  { label: "แผนกก่อสร้างระบบไฟฟ้า", costCenter: "K304101040" },
  { label: "แผนกบริหารรายได้ค่าไฟฟ้า", costCenter: "K304101050" },
  { label: "แผนกคลังพัสดุ", costCenter: "K304101060" },
  { label: "กฟส.บ้านเกาะพีพี", costCenter: "K304107000" },
  { label: "กฟส.อ่าวนาง", costCenter: "K304108000" }
] as const;

const PAYMENT_BUDGET_TYPES: PaymentBudgetType[] = ["operating", "po", "network"];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const toTrimmedString = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

export const isPaymentBudgetType = (value: unknown): value is PaymentBudgetType =>
  typeof value === "string" && PAYMENT_BUDGET_TYPES.includes(value as PaymentBudgetType);

export const getOperatingCostCenter = (orgLabel: string): string =>
  OPERATING_ORG_OPTIONS.find((option) => option.label === orgLabel)?.costCenter ?? "";

export const buildPaymentBudgetDocText = (paymentBudget: {
  type?: PaymentBudgetType;
  org_label?: string;
  cost_center?: string;
  po_no?: string;
  network_no?: string;
  account_code?: string;
  account_name?: string;
}): string => {
  const accountCode = toTrimmedString(paymentBudget.account_code);
  const accountName = toTrimmedString(paymentBudget.account_name);
  const accountText = accountName ? ` (${accountName})` : "";

  if (!paymentBudget.type || !accountCode) {
    return "";
  }

  if (paymentBudget.type === "operating") {
    const orgLabel = toTrimmedString(paymentBudget.org_label);
    const costCenter = toTrimmedString(paymentBudget.cost_center);

    if (!orgLabel || !costCenter) {
      return "";
    }

    return `โดยเบิกค่าใช้จ่ายจากงบทำการ ${orgLabel} ศูนย์ต้นทุน ${costCenter} รหัสบัญชี ${accountCode}${accountText}`;
  }

  if (paymentBudget.type === "po") {
    const poNo = toTrimmedString(paymentBudget.po_no);
    if (!poNo) {
      return "";
    }

    return `โดยเบิกค่าใช้จ่ายจากใบสั่งเลขที่ ${poNo} รหัสบัญชี ${accountCode}${accountText}`;
  }

  const networkNo = toTrimmedString(paymentBudget.network_no);
  if (!networkNo) {
    return "";
  }

  return `โดยเบิกค่าใช้จ่ายจากงบโครงข่าย ${networkNo} รหัสบัญชี ${accountCode}${accountText}`;
};

export const normalizePaymentBudget = (value: unknown): PaymentBudget | null => {
  if (!isRecord(value) || !isPaymentBudgetType(value.type)) {
    return null;
  }

  const orgLabel = toTrimmedString(value.org_label);
  const poNo = toTrimmedString(value.po_no);
  const networkNo = toTrimmedString(value.network_no);
  const accountCode = toTrimmedString(value.account_code);
  const accountName = toTrimmedString(value.account_name);
  const providedCostCenter = toTrimmedString(value.cost_center);
  const costCenter = value.type === "operating" ? providedCostCenter || getOperatingCostCenter(orgLabel) : "";

  const normalized: PaymentBudget = {
    type: value.type,
    org_label: orgLabel || undefined,
    cost_center: costCenter || undefined,
    po_no: poNo || undefined,
    network_no: networkNo || undefined,
    account_code: accountCode,
    account_name: accountName,
    doc_text: buildPaymentBudgetDocText({
      type: value.type,
      org_label: orgLabel,
      cost_center: costCenter,
      po_no: poNo,
      network_no: networkNo,
      account_code: accountCode,
      account_name: accountName
    })
  };

  return normalized;
};
