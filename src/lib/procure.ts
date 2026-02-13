export type ProcureStatus =
  | "DRAFT"
  | "WAIT_EPROC"
  | "EPROC_DONE_WAITING"
  | "WAIT_REVIEW"
  | "REVISION_REQUIRED"
  | "WAIT_PAYMENT"
  | "DONE";

export type ProcureCase = {
  id: string;
  title: string;
  department: string;
  status: ProcureStatus;
  form_data: Record<string, unknown>;
  doc_url: string | null;
  doc_version: number;
  created_at: string;
  updated_at: string;
};

export const statusLabel: Record<ProcureStatus, string> = {
  DRAFT: "รออนุมัติ",
  WAIT_EPROC: "รออนุมัติ",
  EPROC_DONE_WAITING: "ลงแล้ว รอดำเนินการ",
  WAIT_REVIEW: "รอตรวจ",
  REVISION_REQUIRED: "รอการแก้ไข",
  WAIT_PAYMENT: "รอเบิกจ่าย",
  DONE: "เสร็จสิ้น"
};
