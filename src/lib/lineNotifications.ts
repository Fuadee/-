import { formatMoneyTH } from "@/lib/money";
import { calculateVatBreakdown, type VatMode } from "@/lib/vat";

type LooseObject = Record<string, unknown>;

const asTrimmedString = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

const parsePayload = (value: unknown): LooseObject => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as LooseObject;
};

const toFiniteNumber = (value: unknown): number | null => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const resolveVatMode = (payload: LooseObject): VatMode => {
  const raw = payload.vat_mode;
  if (raw === "included" || raw === "excluded" || raw === "none") {
    return raw;
  }

  return "included";
};

const resolveLineTotal = (item: LooseObject): number | null => {
  const directTotal =
    toFiniteNumber(item.total) ??
    toFiniteNumber(item.line_total_num) ??
    toFiniteNumber(item.total_num) ??
    toFiniteNumber(item.grand_total);

  if (directTotal !== null) {
    return directTotal;
  }

  const qty = toFiniteNumber(item.qty) ?? 0;
  const price = toFiniteNumber(item.price) ?? 0;
  const computed = qty * price;

  return Number.isFinite(computed) ? computed : null;
};

const calculateNetTotalFromPayload = (payload: LooseObject): number => {
  const rawItems = payload.items;
  if (!Array.isArray(rawItems)) {
    return 0;
  }

  const vatMode = resolveVatMode(payload);

  const total = rawItems.reduce((sum, item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return sum;
    }

    const lineTotal = resolveLineTotal(item as LooseObject);
    if (lineTotal === null) {
      return sum;
    }

    return sum + calculateVatBreakdown(lineTotal, vatMode).total;
  }, 0);

  return Number.isFinite(total) ? total : 0;
};

const THAI_WEEKDAYS = ["วันอาทิตย์", "วันจันทร์", "วันอังคาร", "วันพุธ", "วันพฤหัสบดี", "วันศุกร์", "วันเสาร์"];
const THAI_MONTHS = [
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

const toBangkokDate = (date: Date): Date => {
  const bangkokDateString = date.toLocaleString("en-US", {
    timeZone: "Asia/Bangkok"
  });

  return new Date(bangkokDateString);
};

export const formatThaiDateTimeWithWeekdayBE = (date: Date): string => {
  const bangkokDate = toBangkokDate(date);
  const weekday = THAI_WEEKDAYS[bangkokDate.getDay()] ?? "";
  const day = bangkokDate.getDate();
  const month = THAI_MONTHS[bangkokDate.getMonth()] ?? "";
  const buddhistYear = bangkokDate.getFullYear() + 543;
  const hour = String(bangkokDate.getHours()).padStart(2, "0");
  const minute = String(bangkokDate.getMinutes()).padStart(2, "0");

  return `${weekday}ที่ ${day} ${month} พ.ศ. ${buddhistYear} เวลา ${hour}:${minute}`;
};

export const resolveJobTitle = (payload: unknown): string => {
  const parsed = parsePayload(payload);

  return (
    asTrimmedString(parsed.title) ||
    asTrimmedString(parsed.case_title) ||
    asTrimmedString(parsed.subject_detail) ||
    asTrimmedString(parsed.subject) ||
    asTrimmedString(parsed.purpose) ||
    "(ไม่ระบุชื่องาน)"
  );
};

export const resolveRequesterName = (user: { email?: string | null; user_metadata?: Record<string, unknown> | null } | null): string => {
  if (!user) {
    return "(ไม่ระบุชื่อ)";
  }

  return (
    asTrimmedString(user.user_metadata?.display_name) ||
    asTrimmedString(user.user_metadata?.full_name) ||
    asTrimmedString(user.user_metadata?.name) ||
    asTrimmedString(user.email) ||
    "(ไม่ระบุชื่อ)"
  );
};

export const resolveRequesterProfile = (user: { email?: string | null; user_metadata?: Record<string, unknown> | null } | null) => ({
  requesterName: resolveRequesterName(user),
  requesterDisplayName:
    asTrimmedString(user?.user_metadata?.display_name) ||
    asTrimmedString(user?.user_metadata?.full_name) ||
    asTrimmedString(user?.user_metadata?.name),
  requesterEmail: asTrimmedString(user?.email)
});

const resolvePrecheckAssigneeDisplayName = (input: {
  payload: unknown;
  assigneeName?: string;
  requesterName?: string;
  requesterDisplayName?: string;
  requesterEmail?: string;
}): string => {
  const payload = parsePayload(input.payload);

  return (
    // Prefer "ผู้ได้รับมอบหมาย" from form payload first.
    asTrimmedString(payload.assignee) ||
    asTrimmedString(payload.assignee_name) ||
    asTrimmedString(payload.assigned_to_name) ||
    asTrimmedString(payload.assignedToName) ||
    asTrimmedString(payload.receiver_name) ||
    asTrimmedString(payload.recipient_name) ||
    asTrimmedString(payload.delegate_name) ||
    asTrimmedString(payload.owner_name) ||
    // Then fallback to normalized assignee name mapped from caller.
    asTrimmedString(input.assigneeName) ||
    // Then requester/display name alternatives.
    asTrimmedString(input.requesterName) ||
    asTrimmedString(input.requesterDisplayName) ||
    // Email should be the very last real value.
    asTrimmedString(input.requesterEmail) ||
    "(ไม่ระบุชื่อ)"
  );
};

export const resolveNetTotalFromPayload = (payload: unknown): string => {
  const parsed = parsePayload(payload);
  const total = calculateNetTotalFromPayload(parsed);
  return formatMoneyTH(total);
};

export const buildPrecheckPendingLineMessage = (input: {
  payload: unknown;
  assigneeName?: string;
  requesterName?: string;
  requesterDisplayName?: string;
  requesterEmail?: string;
  createdAt: Date;
  jobUrl: string;
}): string => {
  const jobTitle = resolveJobTitle(input.payload);
  const assigneeDisplayName = resolvePrecheckAssigneeDisplayName(input);
  const netTotal = resolveNetTotalFromPayload(input.payload);
  const createdAtThai = formatThaiDateTimeWithWeekdayBE(input.createdAt);

  return [
    "🟡 มีงานรอตรวจเบื้องต้น",
    "",
    `📄 งาน: ${jobTitle}`,
    `👤 ผู้ได้รับมอบหมาย: ${assigneeDisplayName}`,
    `💰 วงเงิน: ${netTotal} บาท`,
    `⏰ เวลา: ${createdAtThai}`,
    "",
    "👉 กรุณาเข้าตรวจสอบก่อนส่งอนุมัติ",
    `🔗 ${input.jobUrl}`
  ].join("\n");
};

export const buildPrecheckApprovedLineMessage = (input: {
  payload: unknown;
  assigneeName?: string;
  requesterName?: string;
  requesterDisplayName?: string;
  requesterEmail?: string;
  approvedAt: Date;
  jobUrl: string;
}): string => {
  const jobTitle = resolveJobTitle(input.payload);
  const assigneeDisplayName = resolvePrecheckAssigneeDisplayName(input);
  const netTotal = resolveNetTotalFromPayload(input.payload);
  const approvedAtThai = formatThaiDateTimeWithWeekdayBE(input.approvedAt);

  return [
    "🟢 ตรวจสอบเบื้องต้นผ่านแล้ว",
    "",
    `📄 งาน: ${jobTitle}`,
    `👤 ผู้ได้รับมอบหมาย: ${assigneeDisplayName}`,
    `💰 วงเงิน: ${netTotal} บาท`,
    `⏰ เวลา: ${approvedAtThai}`,
    "",
    "📝 พร้อมเข้าสู่ขั้นสร้างเอกสาร",
    "✅ เมื่อสร้างเอกสารเสร็จแล้ว ระบบจะเข้าสู่รออนุมัติ",
    "",
    `🔗 ${input.jobUrl}`
  ].join("\n");
};

export const buildNeedsFixReturnedToPrecheckLineMessage = (input: {
  payload: unknown;
  assigneeName?: string;
  returnedAt: Date;
  jobUrl: string;
}): string => {
  const jobTitle = resolveJobTitle(input.payload);
  const assigneeDisplayName = resolvePrecheckAssigneeDisplayName({
    payload: input.payload,
    assigneeName: input.assigneeName
  });
  const returnedAtThai = formatThaiDateTimeWithWeekdayBE(input.returnedAt);

  return [
    "🔁 มีงานแก้ไขส่งกลับมาตรวจเบื้องต้นอีกครั้ง",
    "",
    `งาน: ${jobTitle}`,
    `ผู้รับมอบหมาย: ${assigneeDisplayName}`,
    "สถานะ: แก้ไขแล้ว รอตรวจเบื้องต้นอีกครั้ง",
    `เวลา: ${returnedAtThai}`,
    `ลิงก์ตรวจงาน: ${input.jobUrl}`
  ].join("\n");
};
