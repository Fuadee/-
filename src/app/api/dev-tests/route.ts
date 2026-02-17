import { NextResponse } from "next/server";

import { buildDocxTemplateData } from "@/lib/docxTemplateData";
import { formatMoneyTH } from "@/lib/money";
import { toThaiBahtText } from "@/lib/thaiBahtText";

export const runtime = "nodejs";

export async function GET() {
  const checks = [
    {
      name: "formatMoneyTH(1234.5)",
      actual: formatMoneyTH(1234.5),
      expected: "1,234.50"
    },
    {
      name: "toThaiBahtText(980)",
      actual: toThaiBahtText(980),
      expected: "เก้าร้อยแปดสิบบาทถ้วน"
    },
    {
      name: "toThaiBahtText(120.5)",
      actual: toThaiBahtText(120.5),
      expected: "หนึ่งร้อยยี่สิบบาทห้าสิบสตางค์"
    }
  ];

  const calcIncluded = buildDocxTemplateData({
    vat_mode: "included",
    vat_enabled: true,
    vat_rate: 7,
    items: [
      { name: "A", qty: "2", price: "100" },
      { name: "B", qty: "3", price: "200" }
    ]
  });

  checks.push({
    name: "VAT 7% amount from VAT-included prices",
    actual: String(Number(calcIncluded.vat_amount.toFixed(2))),
    expected: String(52.34)
  });

  checks.push({
    name: "Grand total equals VAT-included subtotal",
    actual: String(calcIncluded.grand_total),
    expected: String(800)
  });

  const calcExcluded = buildDocxTemplateData({
    vat_mode: "excluded",
    vat_rate: 7,
    items: [{ name: "A", qty: "1", price: "100" }]
  });

  checks.push({
    name: "Excluded VAT mode adds VAT to grand total",
    actual: String(Number(calcExcluded.grand_total.toFixed(2))),
    expected: String(107)
  });

  const calcNone = buildDocxTemplateData({
    vat_mode: "none",
    vat_rate: 7,
    items: [{ name: "A", qty: "1", price: "100" }]
  });

  checks.push({
    name: "No VAT mode keeps VAT amount as zero",
    actual: String(calcNone.vat_amount),
    expected: String(0)
  });

  const failures = checks.filter((check) => check.actual !== check.expected);

  return NextResponse.json({
    ok: failures.length === 0,
    checks,
    failures
  });
}
