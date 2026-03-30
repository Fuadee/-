import { calculateVatBreakdown, type VatMode } from "./vat.ts";

type LooseObject = Record<string, unknown>;

type EProcurementValue<T> = {
  value: T;
  source: string;
};

type EProcurementCardData = {
  summary: EProcurementValue<string>;
  totalInclVat: EProcurementValue<number | null>;
  vendorName: EProcurementValue<string>;
  taxId: EProcurementValue<string>;
  payloadType: string;
  topLevelKeys: string[];
};

const asTrimmedString = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

const asObject = (value: unknown): LooseObject => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as LooseObject;
};

const getPayloadCandidates = (payloadInput: unknown): Array<{ source: string; value: LooseObject }> => {
  const root = asObject(payloadInput);
  const candidates: Array<{ source: string; value: LooseObject }> = [{ source: "payload", value: root }];
  const nestedCandidates = [
    { key: "payload", source: "payload.payload" },
    { key: "form", source: "payload.form" },
    { key: "data", source: "payload.data" },
    { key: "case", source: "payload.case" },
    { key: "procurement", source: "payload.procurement" },
    { key: "summary", source: "payload.summary" },
    { key: "calculation", source: "payload.calculation" }
  ] as const;

  for (const nested of nestedCandidates) {
    const nestedValue = asObject(root[nested.key]);
    if (Object.keys(nestedValue).length > 0) {
      candidates.push({ source: nested.source, value: nestedValue });
    }
  }

  return candidates;
};

const getByPath = (payload: LooseObject, path: string): unknown => {
  const keys = path.split(".");
  let current: unknown = payload;

  for (const key of keys) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }

    current = (current as LooseObject)[key];
  }

  return current;
};

const firstNonEmptyString = (payloadInput: unknown, paths: string[]): EProcurementValue<string> => {
  const candidates = getPayloadCandidates(payloadInput);
  for (const candidate of candidates) {
    for (const path of paths) {
      const resolved = asTrimmedString(getByPath(candidate.value, path));
      if (resolved) {
        return { value: resolved, source: `${candidate.source}.${path}` };
      }
    }
  }

  return { value: "", source: "none" };
};

const toFiniteNumber = (value: unknown): number | null => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().replace(/,/g, "");
  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const resolveVatMode = (payload: LooseObject): VatMode => {
  const raw = asTrimmedString(payload.vat_mode ?? payload.vat_type).toLowerCase();
  if (raw === "included" || raw === "excluded" || raw === "none") {
    return raw;
  }

  return "included";
};

const resolveLineTotal = (item: LooseObject): number | null => {
  const direct =
    toFiniteNumber(item.total) ??
    toFiniteNumber(item.line_total_num) ??
    toFiniteNumber(item.total_num) ??
    toFiniteNumber(item.grand_total) ??
    toFiniteNumber(item.amount);

  if (direct !== null) {
    return direct;
  }

  const qty = toFiniteNumber(item.qty) ?? toFiniteNumber(item.quantity);
  const unitPrice = toFiniteNumber(item.price) ?? toFiniteNumber(item.unit_price);
  if (qty === null || unitPrice === null) {
    return null;
  }

  const computed = qty * unitPrice;
  return Number.isFinite(computed) ? computed : null;
};

const sumItemsSubtotal = (payload: LooseObject): EProcurementValue<number | null> => {
  const items = payload.items;
  if (!Array.isArray(items)) {
    return { value: null, source: "items:none" };
  }

  const subtotal = items.reduce((sum, item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return sum;
    }

    const lineTotal = resolveLineTotal(item as LooseObject);
    if (lineTotal === null) {
      return sum;
    }

    return sum + lineTotal;
  }, 0);

  return {
    value: Number.isFinite(subtotal) ? subtotal : null,
    source: "items[*].{total|line_total_num|total_num|grand_total|amount|qty*price}"
  };
};

export const getEProcurementSummary = (payloadInput: unknown): EProcurementValue<string> => {
  return firstNonEmptyString(payloadInput, ["subject", "title", "case_title", "name"]);
};

export const getEProcurementVendorName = (payloadInput: unknown): EProcurementValue<string> => {
  return firstNonEmptyString(payloadInput, ["vendor_name", "supplier_name", "selected_vendor", "vendor.name", "supplier.name"]);
};

export const getEProcurementTaxId = (payloadInput: unknown): EProcurementValue<string> => {
  return firstNonEmptyString(payloadInput, ["tax_id", "vendor_tax_id", "taxpayer_id", "vendor.tax_id", "supplier.tax_id"]);
};

export const getEProcurementTotalInclVat = (payloadInput: unknown): EProcurementValue<number | null> => {
  const payload = asObject(payloadInput);
  const payloadCandidates = getPayloadCandidates(payloadInput);

  const directTotalCandidates = [
    "total",
    "grand_total",
    "net_total",
    "total_net",
    "total_amount",
    "calculation.total",
    "calculation.grand_total",
    "calculation.net_total",
    "summary.total",
    "summary.grand_total",
    "summary.net_total",
    "payload_summary.total"
  ];

  for (const candidate of payloadCandidates) {
    for (const path of directTotalCandidates) {
      const value = toFiniteNumber(getByPath(candidate.value, path));
      if (value !== null) {
        return { value, source: `${candidate.source}.${path}` };
      }
    }
  }

  for (const candidate of payloadCandidates) {
    const budgetAmount = toFiniteNumber(candidate.value.budget_amount);
    if (budgetAmount !== null) {
      return { value: budgetAmount, source: `${candidate.source}.budget_amount` };
    }
  }

  const subtotal =
    toFiniteNumber(payload.subtotal_incl_vat) ??
    toFiniteNumber(payload.subtotal) ??
    toFiniteNumber(payload.base_total) ??
    toFiniteNumber(payload.sub_total);
  const itemsSubtotal = sumItemsSubtotal(payload);
  const effectiveSubtotal = subtotal ?? itemsSubtotal.value;

  if (effectiveSubtotal === null) {
    return { value: null, source: "none" };
  }

  const vatMode = resolveVatMode(payload);
  const vatRate = toFiniteNumber(payload.vat_rate) ?? 7;
  const vatAmount = toFiniteNumber(payload.vat_amount);

  if (vatMode === "excluded") {
    const computed = effectiveSubtotal + (vatAmount ?? effectiveSubtotal * (vatRate / 100));
    return {
      value: Number.isFinite(computed) ? computed : null,
      source: `computed:subtotal(${subtotal !== null ? "subtotal" : itemsSubtotal.source})+vat(excluded)`
    };
  }

  const computedTotal = calculateVatBreakdown(effectiveSubtotal, vatMode).total;
  return {
    value: Number.isFinite(computedTotal) ? computedTotal : null,
    source: `computed:subtotal(${subtotal !== null ? "subtotal" : itemsSubtotal.source})+vat(${vatMode})`
  };
};

export const getEProcurementCardData = (payloadInput: unknown): EProcurementCardData => ({
  summary: getEProcurementSummary(payloadInput),
  totalInclVat: getEProcurementTotalInclVat(payloadInput),
  vendorName: getEProcurementVendorName(payloadInput),
  taxId: getEProcurementTaxId(payloadInput),
  payloadType: Array.isArray(payloadInput) ? "array" : payloadInput === null ? "null" : typeof payloadInput,
  topLevelKeys: Object.keys(asObject(payloadInput))
});
