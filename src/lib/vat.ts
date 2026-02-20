export type VatMode = "included" | "excluded" | "none";

export const VAT_RATE_DECIMAL = 0.07;

export const getVatModeLabel = (vatMode: VatMode | null): string => {
  if (vatMode === "included") return "รวม VAT";
  if (vatMode === "excluded") return "ไม่รวม VAT";
  if (vatMode === "none") return "ไม่มี VAT";
  return "ยังไม่ได้เลือก";
};

export const getUnitPriceColumnLabel = (vatMode: VatMode | null): string => {
  if (vatMode === "included") return "ราคาต่อหน่วย (รวม VAT)";
  if (vatMode === "excluded") return "ราคาต่อหน่วย (ก่อน VAT)";
  if (vatMode === "none") return "ราคาต่อหน่วย (ไม่คิด VAT)";
  return "ราคาต่อหน่วย";
};

export const getVatModeHelperText = (vatMode: VatMode | null): string => {
  if (vatMode === "included") return "กรอกราคาที่รวม VAT แล้ว";
  if (vatMode === "excluded") return "กรอกราคาก่อน VAT ระบบจะคำนวณ VAT เพิ่มให้";
  if (vatMode === "none") return "ไม่คิด VAT";
  return "";
};

export const calculateVatBreakdown = (
  inputTotal: number,
  vatMode: VatMode,
  vatRateDecimal = VAT_RATE_DECIMAL
): { base: number; vat: number; total: number } => {
  if (vatMode === "included") {
    const base = inputTotal / (1 + vatRateDecimal);
    return {
      base,
      vat: inputTotal - base,
      total: inputTotal
    };
  }

  if (vatMode === "excluded") {
    const base = inputTotal;
    const vat = base * vatRateDecimal;
    return {
      base,
      vat,
      total: base + vat
    };
  }

  return {
    base: inputTotal,
    vat: 0,
    total: inputTotal
  };
};
