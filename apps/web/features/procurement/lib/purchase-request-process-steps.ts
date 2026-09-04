import {
  buildPurchaseRequestProcessSteps,
  resolvePurchaseRequestCancelledIndex,
  type ProcessStep,
} from "@bloqer/domain";

/** Map SC detail data → process stepper steps. */
export function purchaseRequestProcessSteps(input: {
  status: string;
  submittedAt?: string | Date | null;
  quoteCount: number;
  /** Any linked OC ever (incl. cancelled) — marks Elegida on anulación. */
  hasLinkedPo: boolean;
}): ProcessStep[] {
  const cancelledReachedIndex =
    input.status === "CANCELLED"
      ? resolvePurchaseRequestCancelledIndex({
          hasLinkedPo: input.hasLinkedPo,
          quoteCount: input.quoteCount,
          submittedAt: input.submittedAt,
        })
      : 0;

  return buildPurchaseRequestProcessSteps({
    status: input.status,
    cancelledReachedIndex,
  });
}
