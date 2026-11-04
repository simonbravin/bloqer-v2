import {
  buildPurchaseOrderProcessSteps,
  resolvePurchaseOrderCancelledIndex,
  type ProcessStep,
} from "@bloqer/domain";

/** Map OC detail + billing flags → process stepper steps. */
export function purchaseOrderProcessSteps(input: {
  status: string;
  hasReceivedQuantity: boolean;
  /** Canonical received amount covered by ISSUED invoices; draft reservations do not count. */
  invoiceSettled: boolean;
  hasIssuedInvoice: boolean;
  /** Canonical issued-payables settlement; may include credit notes rather than cash payment. */
  fullyPaid: boolean;
  approvedAt?: string | Date | null;
  confirmedAt?: string | Date | null;
  /**
   * True when the OC left DRAFT (SUBMITTED+) before cancel.
   * Used when approvedAt/confirmedAt are null (cancel while pending approval).
   */
  leftDraft?: boolean;
}): ProcessStep[] {
  const cancelledReachedIndex =
    input.status === "CANCELLED"
      ? resolvePurchaseOrderCancelledIndex({
          hasReceivedQuantity: input.hasReceivedQuantity,
          hasIssuedInvoice: input.hasIssuedInvoice,
          fullyPaid: input.fullyPaid,
          approvedAt: input.approvedAt,
          confirmedAt: input.confirmedAt,
          leftDraft: input.leftDraft,
        })
      : 0;

  return buildPurchaseOrderProcessSteps({
    status: input.status,
    hasReceivedQuantity: input.hasReceivedQuantity,
    invoiceSettled: input.invoiceSettled,
    hasIssuedInvoice: input.hasIssuedInvoice,
    fullyPaid: input.fullyPaid,
    cancelledReachedIndex,
  });
}
