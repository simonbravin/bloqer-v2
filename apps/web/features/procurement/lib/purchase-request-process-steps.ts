import {
  buildPurchaseRequestProcessSteps,
  type ProcessStep,
} from "@bloqer/domain";

/** Map SC detail data → process stepper steps. */
export function purchaseRequestProcessSteps(input: {
  status: string;
  submittedAt?: string | Date | null;
  quoteCount: number;
  hasLinkedPo: boolean;
}): ProcessStep[] {
  let cancelledReachedIndex = 0;
  if (input.status === "CANCELLED") {
    if (input.hasLinkedPo) cancelledReachedIndex = 3;
    else if (input.quoteCount > 0 || input.submittedAt) cancelledReachedIndex = 2;
    else cancelledReachedIndex = 0;
  }
  return buildPurchaseRequestProcessSteps({
    status: input.status,
    cancelledReachedIndex,
  });
}
