export const toNumber = (value: string | number | null | undefined): number => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value !== "string") {
    return 0;
  }

  const normalized = Number(value.replace(/,/g, "").trim());
  return Number.isFinite(normalized) ? normalized : 0;
};

export const formatMoneyTH = (value: number): string =>
  new Intl.NumberFormat("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number.isFinite(value) ? value : 0);
