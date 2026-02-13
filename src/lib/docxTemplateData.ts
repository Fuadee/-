import { formatMoneyTH, toNumber } from "@/lib/money";
import { toThaiBahtText } from "@/lib/thaiBahtText";

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
  vendor_address?: string | null;
  receipt_no?: string | null;
  assignee?: string | null;
  assignee_position?: string | null;
  approved_by?: string | null;
  items?: ItemPayload[] | null;
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
    const total = qty * price;

    return {
      no: index + 1,
      name: item.name ?? "",
      qty,
      unit: item.unit ?? "",
      price: formatMoneyTH(price),
      spec: item.spec ?? "",
      total: formatMoneyTH(total),
      price_fmt: formatMoneyTH(price),
      total_fmt: formatMoneyTH(total),
      qty_num: qty,
      price_num: price,
      total_num: total
    };
  });
};

export const buildDocxTemplateData = (body: GeneratePayload) => {
  const normalizedItems = normalizeItems(body.items);
  const subtotal = normalizedItems.reduce((sum, item) => sum + item.total_num, 0);
  const vatEnabled = body.vat_enabled ?? true;
  const vatRate = toNumber(body.vat_rate ?? 7);
  const vatAmount = vatEnabled ? subtotal * (vatRate / 100) : 0;
  const grandTotal = subtotal + vatAmount;

  return {
    department: body.department ?? "",
    subject: body.subject ?? "",
    subject_detail: body.subject_detail ?? "",
    purpose: body.purpose ?? "",
    budget_amount: body.budget_amount ?? "",
    budget_source: body.budget_source ?? "",
    vendor_name: body.vendor_name ?? "",
    vendor_address: body.vendor_address ?? "",
    receipt_no: body.receipt_no ?? "",
    assignee: body.assignee ?? "",
    assignee_position: body.assignee_position ?? "",
    approved_by: body.approved_by ?? "",
    items: normalizedItems,
    vat_enabled: vatEnabled,
    vat_rate: vatRate,
    vat_rate_percent: `${vatRate}%`,
    subtotal,
    vat_amount: vatAmount,
    grand_total: grandTotal,
    subtotal_fmt: formatMoneyTH(subtotal),
    vat_amount_fmt: formatMoneyTH(vatAmount),
    grand_total_fmt: formatMoneyTH(grandTotal),
    grand_total_text: toThaiBahtText(grandTotal)
  };
};
