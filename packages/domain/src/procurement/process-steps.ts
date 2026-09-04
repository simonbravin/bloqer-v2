/**
 * Pure process-track helpers for SC / OC detail steppers.
 * Derived from entity status + linked-doc flags — nothing persisted.
 */

export type ProcessStepState = "done" | "current" | "upcoming" | "cancelled";

export type ProcessStep = {
  id: string;
  label: string;
  state: ProcessStepState;
};

const SC_DEFS = [
  { id: "draft", label: "Borrador" },
  { id: "sent", label: "Enviada" },
  { id: "quoting", label: "Cotizando" },
  { id: "selected", label: "Elegida" },
  { id: "completed", label: "Completada" },
] as const;

const OC_DEFS = [
  { id: "draft", label: "Borrador" },
  { id: "approve", label: "Aprobar" },
  { id: "confirm", label: "Confirmar" },
  { id: "receive", label: "Recibir" },
  { id: "invoice", label: "Facturar" },
  { id: "pay", label: "Pagar" },
] as const;

export type PurchaseRequestProcessStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "QUOTE_SELECTED"
  | "COMPLETED"
  | "CANCELLED";

export type PurchaseOrderProcessStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "APPROVED"
  | "CONFIRMED"
  | "PARTIALLY_RECEIVED"
  | "RECEIVED"
  | "CANCELLED";

export type PurchaseRequestProcessInput = {
  status: PurchaseRequestProcessStatus | string;
  /** When CANCELLED: how far the happy path got (0=Borrador … 3=Elegida). */
  cancelledReachedIndex?: number;
};

export type PurchaseOrderProcessInput = {
  status: PurchaseOrderProcessStatus | string;
  hasReceivedQuantity: boolean;
  /** True when issued invoice amount covers received (pending to invoice is zero). */
  invoiceSettled: boolean;
  /** True when there is at least one ISSUED supplier invoice on the PO. */
  hasIssuedInvoice: boolean;
  /** True when issued invoices exist and all linked payables are fully PAID. */
  fullyPaid: boolean;
  /** When CANCELLED: happy-path index reached (0=Borrador … 3=Recibir). */
  cancelledReachedIndex?: number;
};

function paintHappyPath(
  defs: ReadonlyArray<{ id: string; label: string }>,
  currentIndex: number,
  allDone: boolean,
): ProcessStep[] {
  if (allDone) {
    return defs.map((d) => ({ id: d.id, label: d.label, state: "done" as const }));
  }
  return defs.map((d, i) => {
    if (i < currentIndex) return { id: d.id, label: d.label, state: "done" as const };
    if (i === currentIndex) return { id: d.id, label: d.label, state: "current" as const };
    return { id: d.id, label: d.label, state: "upcoming" as const };
  });
}

function paintCancelled(
  defs: ReadonlyArray<{ id: string; label: string }>,
  reachedIndex: number,
): ProcessStep[] {
  const capped = Math.max(0, Math.min(reachedIndex, defs.length - 1));
  return defs.map((d, i) => {
    if (i < capped) return { id: d.id, label: d.label, state: "done" as const };
    if (i === capped) return { id: d.id, label: "Anulada", state: "cancelled" as const };
    return { id: d.id, label: d.label, state: "upcoming" as const };
  });
}

/**
 * SC track: Borrador → Enviada → Cotizando → Elegida → Completada
 * SUBMITTED lands on Cotizando (even with zero quotes yet).
 */
export function buildPurchaseRequestProcessSteps(
  input: PurchaseRequestProcessInput,
): ProcessStep[] {
  const status = input.status;
  if (status === "CANCELLED") {
    return paintCancelled(SC_DEFS, input.cancelledReachedIndex ?? 0);
  }
  if (status === "COMPLETED") {
    return paintHappyPath(SC_DEFS, SC_DEFS.length - 1, true);
  }
  if (status === "QUOTE_SELECTED") {
    return paintHappyPath(SC_DEFS, 3, false);
  }
  if (status === "SUBMITTED") {
    return paintHappyPath(SC_DEFS, 2, false);
  }
  // DRAFT or unknown → Borrador
  return paintHappyPath(SC_DEFS, 0, false);
}

/**
 * OC track: Borrador → Aprobar → Confirmar → Recibir → Facturar → Pagar
 * Skipped statuses (auto-confirm) leave intermediate steps as done.
 */
export function buildPurchaseOrderProcessSteps(
  input: PurchaseOrderProcessInput,
): ProcessStep[] {
  const status = input.status;
  if (status === "CANCELLED") {
    return paintCancelled(OC_DEFS, input.cancelledReachedIndex ?? 0);
  }

  // Still receiving until fully RECEIVED (partial stays on Recibir).
  if (status === "CONFIRMED" || status === "PARTIALLY_RECEIVED") {
    return paintHappyPath(OC_DEFS, 3, false);
  }

  if (status === "RECEIVED") {
    if (input.fullyPaid) {
      return paintHappyPath(OC_DEFS, OC_DEFS.length - 1, true);
    }
    // Still quantity/amount to invoice → stay on Facturar even if some invoices exist.
    if (!input.invoiceSettled) {
      return paintHappyPath(OC_DEFS, 4, false);
    }
    if (input.hasIssuedInvoice) {
      return paintHappyPath(OC_DEFS, 5, false);
    }
    // Settled only via drafts (nothing ISSUED yet) → still Facturar.
    return paintHappyPath(OC_DEFS, 4, false);
  }

  if (status === "APPROVED") {
    return paintHappyPath(OC_DEFS, 2, false);
  }
  if (status === "SUBMITTED") {
    return paintHappyPath(OC_DEFS, 1, false);
  }
  // DRAFT or unknown
  return paintHappyPath(OC_DEFS, 0, false);
}

export const PURCHASE_REQUEST_PROCESS_STEP_DEFS = SC_DEFS;
export const PURCHASE_ORDER_PROCESS_STEP_DEFS = OC_DEFS;
