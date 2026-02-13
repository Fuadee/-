const DIGITS = ["ศูนย์", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"];
const POSITIONS = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน"];

const readUnderMillion = (num: number): string => {
  if (num === 0) {
    return "";
  }

  const chars = String(num).split("");
  const len = chars.length;

  return chars
    .map((char, idx) => {
      const digit = Number(char);
      if (digit === 0) {
        return "";
      }

      const pos = len - idx - 1;

      if (pos === 0) {
        if (digit === 1 && len > 1) {
          return "เอ็ด";
        }
        return DIGITS[digit];
      }

      if (pos === 1) {
        if (digit === 1) {
          return "สิบ";
        }
        if (digit === 2) {
          return "ยี่สิบ";
        }
        return `${DIGITS[digit]}สิบ`;
      }

      return `${DIGITS[digit]}${POSITIONS[pos] ?? ""}`;
    })
    .join("");
};

const readInteger = (num: number): string => {
  if (num === 0) {
    return DIGITS[0];
  }

  const parts: string[] = [];
  let remaining = Math.floor(num);

  while (remaining > 0) {
    parts.unshift(readUnderMillion(remaining % 1_000_000));
    remaining = Math.floor(remaining / 1_000_000);
  }

  return parts
    .map((part, idx) => {
      const isLast = idx === parts.length - 1;
      return isLast ? part : `${part}ล้าน`;
    })
    .join("");
};

export const toThaiBahtText = (value: number): string => {
  const safe = Number.isFinite(value) ? Math.max(0, value) : 0;
  const rounded = Math.round(safe * 100) / 100;
  const baht = Math.floor(rounded);
  const satang = Math.round((rounded - baht) * 100);

  const bahtText = `${readInteger(baht)}บาท`;
  if (satang === 0) {
    return `${bahtText}ถ้วน`;
  }

  return `${bahtText}${readInteger(satang)}สตางค์`;
};
