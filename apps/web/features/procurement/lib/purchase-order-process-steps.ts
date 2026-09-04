import {
  buildPurchaseOrderProcessSteps,
  type ProcessStep,
} from "@bloqer/domain";

/** Map OC detail + billing flags → process stepper steps. */
export function purchaseOrderProcessSteps(input: {
  status: string;
  hasReceivedQuantity: boolean;
  /** pendingToInvoice is zero (received covered by issued+draft). */
  invoiceSettled: boolean;
  hasIssuedInvoice: boolean;
  fullyPaid: boolean;
  approvedAt?: string | Date | null;
  confirmedAt?: string | Date | null;
}): ProcessStep[] {
  let cancelledReachedIndex = 0;
  if (input.status === "CANCELLED") {
    // No prior-status column: infer from timestamps / billing (cancel blocked after receive).
    if (input.hasIssuedInvoice || input.fullyPaid) cancelledReachedIndex = 4;
    else if (input.hasReceivedQuantity || input.confirmedAt) cancelledReachedIndex = 3;
    else if (input.approvedAt) cancelledReachedIndex = 2;
    // SUBMITTED-without-approve vs DRAFT both lack timestamps → default Borrador (conservative).
    else cancelledReachedIndex = 0;
  }
  return buildPurchaseOrderProcessSteps({
    status: input.status,
    hasReceivedQuantity: input.hasReceivedQuantity,
    invoiceSettled: input.invoiceSettled,
    hasIssuedInvoice: input.hasIssuedInvoice,
    fullyPaid: input.fullyPaid,
    cancelledReachedIndex,
  });
}
