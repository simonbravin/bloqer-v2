import {
  buildSupplierInvoiceProcessSteps,
  resolveSupplierInvoiceCancelledIndex,
  type ProcessStep,
} from "@bloqer/domain";

/** Map factura proveedor detail + payable → process stepper steps. */
export function supplierInvoiceProcessSteps(input: {
  status: string;
  /** Linked payable status, or null when no CxP row exists. */
  payableStatus?: string | null;
  /** Prefer explicit presence; defaults to `payableStatus != null`. */
  hasPayable?: boolean;
}): ProcessStep[] {
  const payableStatus = input.payableStatus ?? null;
  const hasPayable = input.hasPayable ?? payableStatus != null;
  const fullyPaid = payableStatus === "PAID";
  const partiallyPaid = payableStatus === "PARTIAL";

  const cancelledReachedIndex =
    input.status === "CANCELLED"
      ? resolveSupplierInvoiceCancelledIndex({
          hasPayable,
          fullyPaid,
          partiallyPaid,
        })
      : 0;

  return buildSupplierInvoiceProcessSteps({
    status: input.status,
    payableStatus: hasPayable ? payableStatus : null,
    cancelledReachedIndex,
  });
}
