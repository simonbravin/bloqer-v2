/**
 * Pure process-track helpers for SC / OC / factura proveedor detail steppers.
 * Derived from entity status + linked-doc flags — nothing persisted.
 */

export type ProcessStepState = "done" | "current" | "upcoming" | "cancelled";

export type ProcessStep = {
  id: string;
  label: string;
  state: ProcessStepState;
  /** Happy-path label when `label` was replaced (e.g. cancelled → "Anulada"). */
  replacedLabel?: string;
};

const SC_DEFS = [
  { id: "draft", label: "Borrador" },
  { id: "sent", label: "Enviada" },
  { id: "quoting", label: "Cotizando" },
  { id: "selected", label: "Adjudicada" },
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

/** Factura / gasto proveedor: Borrador → Emitir → Pagar */
const FP_DEFS = [
  { id: "draft", label: "Borrador" },
  { id: "issue", label: "Emitir" },
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

export type SupplierInvoiceProcessStatus = "DRAFT" | "ISSUED" | "CANCELLED";

export type SupplierInvoicePayableProcessStatus =
  | "OPEN"
  | "PARTIAL"
  | "PAID"
  | "OVERDUE"
  | "CANCELLED";

export type PurchaseRequestProcessInput = {
  status: PurchaseRequestProcessStatus | string;
  /** When CANCELLED: how far the happy path got (0=Borrador … 3=Elegida). */
  cancelledReachedIndex?: number;
  /** Partial award progress while status is still SUBMITTED ([BR-PUR-024]). */
  awardedLineCount?: number;
  totalLineCount?: number;
};

export type PurchaseOrderProcessInput = {
  status: PurchaseOrderProcessStatus | string;
  hasReceivedQuantity: boolean;
  /** True when issued invoice amount covers received (pending to invoice is zero). */
  invoiceSettled: boolean;
  /** True when there is at least one ISSUED supplier invoice on the PO. */
  hasIssuedInvoice: boolean;
  /** True when issued invoices exist and linked payables cover invoiced amount. */
  fullyPaid: boolean;
  /** When CANCELLED: happy-path index (0=Borrador … 4=Facturar). */
  cancelledReachedIndex?: number;
};

export type SupplierInvoiceProcessInput = {
  status: SupplierInvoiceProcessStatus | string;
  /** Linked payable status when the invoice was/is issued. */
  payableStatus?: SupplierInvoicePayableProcessStatus | string | null;
  /** When CANCELLED: happy-path index (0=Borrador · 1=Emitir · 2=Pagar). */
  cancelledReachedIndex?: number;
};

function clampStepIndex(index: number | undefined, maxInclusive: number): number {
  if (index == null || !Number.isFinite(index)) return 0;
  return Math.max(0, Math.min(Math.trunc(index), maxInclusive));
}

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
  const capped = clampStepIndex(reachedIndex, defs.length - 1);
  return defs.map((d, i) => {
    if (i < capped) return { id: d.id, label: d.label, state: "done" as const };
    if (i === capped) {
      return {
        id: d.id,
        label: "Anulada",
        state: "cancelled" as const,
        replacedLabel: d.label,
      };
    }
    return { id: d.id, label: d.label, state: "upcoming" as const };
  });
}

/**
 * Infer cancel marker for SC when status is already CANCELLED.
 * Index: 0 Borrador · 1 Enviada · 2 Cotizando · 3 Elegida
 */
export function resolvePurchaseRequestCancelledIndex(input: {
  hasLinkedPo: boolean;
  quoteCount: number;
  submittedAt?: string | Date | null;
}): number {
  if (input.hasLinkedPo) return 3;
  if (input.quoteCount > 0 || input.submittedAt) return 2;
  return 0;
}

/**
 * Infer cancel marker for OC when status is already CANCELLED.
 * Index: 0 Borrador · 1 Aprobar · 2 Confirmar · 3 Recibir · 4 Facturar
 * (Cancel is blocked after confirmed receipts / received statuses in services.)
 */
export function resolvePurchaseOrderCancelledIndex(input: {
  hasReceivedQuantity: boolean;
  hasIssuedInvoice: boolean;
  fullyPaid: boolean;
  approvedAt?: string | Date | null;
  confirmedAt?: string | Date | null;
  /** True when the OC left DRAFT at least once (no submittedAt column on PO). */
  leftDraft?: boolean;
}): number {
  if (input.hasIssuedInvoice || input.fullyPaid) return 4;
  if (input.hasReceivedQuantity || input.confirmedAt) return 3;
  if (input.approvedAt) return 2;
  if (input.leftDraft) return 1;
  return 0;
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
    const total = input.totalLineCount ?? 0;
    const awarded = input.awardedLineCount ?? 0;
    // Partial award still sits on Cotizando, but mark Adjudicada as upcoming with progress via label.
    if (total > 0 && awarded > 0 && awarded < total) {
      const steps = paintHappyPath(SC_DEFS, 2, false);
      return steps.map((s) =>
        s.id === "quoting"
          ? { ...s, label: `Cotizando (${awarded}/${total})` }
          : s,
      );
    }
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
    // Paid only counts as complete when received qty/amount is also fully invoiced.
    if (input.fullyPaid && input.invoiceSettled) {
      return paintHappyPath(OC_DEFS, OC_DEFS.length - 1, true);
    }
    // Still quantity/amount to invoice → stay on Facturar even if some invoices exist / are paid.
    if (!input.invoiceSettled) {
      return paintHappyPath(OC_DEFS, 4, false);
    }
    if (input.hasIssuedInvoice && !input.fullyPaid) {
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

/**
 * Infer cancel marker for factura proveedor when status is already CANCELLED.
 * Index: 0 Borrador · 1 Emitir · 2 Pagar
 */
export function resolveSupplierInvoiceCancelledIndex(input: {
  /** True when a payable exists (invoice left DRAFT / was issued). */
  hasPayable: boolean;
  fullyPaid: boolean;
  partiallyPaid: boolean;
}): number {
  if (input.fullyPaid || input.partiallyPaid) return 2;
  if (input.hasPayable) return 1;
  return 0;
}

/**
 * Factura / gasto track: Borrador → Emitir → Pagar
 * Payment progress comes from the linked Payable (not invoice.status).
 */
export function buildSupplierInvoiceProcessSteps(
  input: SupplierInvoiceProcessInput,
): ProcessStep[] {
  const status = input.status;
  if (status === "CANCELLED") {
    return paintCancelled(FP_DEFS, input.cancelledReachedIndex ?? 0);
  }

  if (status === "ISSUED") {
    const payable = input.payableStatus ?? null;
    // Sin CxP, o CxP anulada con factura aún emitida = inconsistencia → no saltar a Pagar.
    if (!payable || payable === "CANCELLED") {
      return paintHappyPath(FP_DEFS, 1, false);
    }
    if (payable === "PAID") {
      return paintHappyPath(FP_DEFS, FP_DEFS.length - 1, true);
    }
    if (payable === "PARTIAL") {
      const steps = paintHappyPath(FP_DEFS, 2, false);
      return steps.map((s) =>
        s.id === "pay" ? { ...s, label: "Pagar (parcial)" } : s,
      );
    }
    if (payable === "OVERDUE") {
      const steps = paintHappyPath(FP_DEFS, 2, false);
      return steps.map((s) =>
        s.id === "pay" ? { ...s, label: "Pagar (vencida)" } : s,
      );
    }
    // OPEN (or unexpected payable status) → Pagar
    return paintHappyPath(FP_DEFS, 2, false);
  }

  // DRAFT or unknown
  return paintHappyPath(FP_DEFS, 0, false);
}

export const PURCHASE_REQUEST_PROCESS_STEP_DEFS = SC_DEFS;
export const PURCHASE_ORDER_PROCESS_STEP_DEFS = OC_DEFS;
export const SUPPLIER_INVOICE_PROCESS_STEP_DEFS = FP_DEFS;
