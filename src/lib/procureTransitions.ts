import { ProcureStatus } from "@/lib/procure";

export type TransitionAction =
  | "EPROC_DONE_WAITING"
  | "EPROC_DONE"
  | "REVIEW_PASS"
  | "REVIEW_FAIL"
  | "PAYMENT_DONE";

export const resolveTransition = (
  fromStatus: ProcureStatus,
  action: TransitionAction
): ProcureStatus | null => {
  const allowed: Record<ProcureStatus, Partial<Record<TransitionAction, ProcureStatus>>> = {
    DRAFT: {
      EPROC_DONE_WAITING: "EPROC_DONE_WAITING",
      EPROC_DONE: "WAIT_REVIEW"
    },
    WAIT_EPROC: {
      EPROC_DONE_WAITING: "EPROC_DONE_WAITING",
      EPROC_DONE: "WAIT_REVIEW"
    },
    EPROC_DONE_WAITING: {},
    WAIT_REVIEW: {
      REVIEW_PASS: "WAIT_PAYMENT",
      REVIEW_FAIL: "REVISION_REQUIRED"
    },
    REVISION_REQUIRED: {},
    WAIT_PAYMENT: {
      PAYMENT_DONE: "DONE"
    },
    DONE: {}
  };

  return allowed[fromStatus][action] ?? null;
};
