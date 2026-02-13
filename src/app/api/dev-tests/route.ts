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

  const calc = buildDocxTemplateData({
    vat_enabled: true,
    vat_rate: 7,
    items: [
      { name: "A", qty: "2", price: "100" },
      { name: "B", qty: "3", price: "200" }
    ]
  });

  checks.push({
    name: "VAT 7% amount",
    actual: String(calc.vat_amount),
    expected: String(56)
  });

  const failures = checks.filter((check) => check.actual !== check.expected);

  return NextResponse.json({
    ok: failures.length === 0,
    checks,
    failures
  });
}
