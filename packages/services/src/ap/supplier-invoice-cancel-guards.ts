import { Prisma } from "@bloqer/database";
import { ServiceError } from "../types";

export type CancelSupplierInvoiceGuardInput = {
  status: string;
  documentKind?: string;
  hasPayable: boolean;
  activePaymentCount: number;
  payablePaidAmount: Prisma.Decimal | null;
  /** [D-115] creditedAmount from applied credit notes */
  payableCreditedAmount?: Prisma.Decimal | null;
  /** [BR-NC-005] ISSUED NC/ND referencing this invoice */
  activeCreditDebitNoteCount?: number;
};

/** BR-AP-003 / Proc-CANCEL-AP-001 / [D-115]: block cancel when payments, credits, or child notes exist. */
export function assertCanCancelSupplierInvoice(input: CancelSupplierInvoiceGuardInput): void {
  if (input.documentKind === "CREDIT_NOTE") {
    throw new ServiceError(
      "VALIDATION",
      "Usá anular nota de crédito para este comprobante.",
    );
  }

  if (input.status !== "ISSUED") return;

  if (!input.hasPayable) {
    throw new ServiceError(
      "CONFLICT",
      "La factura emitida no tiene cuenta por pagar vinculada. Contacte soporte.",
    );
  }

  if ((input.activeCreditDebitNoteCount ?? 0) > 0) {
    throw new ServiceError(
      "CONFLICT",
      "No se puede anular: existen notas de crédito o débito emitidas. Anulá las notas primero.",
    );
  }

  if (input.activePaymentCount > 0) {
    throw new ServiceError(
      "CONFLICT",
      "No se puede cancelar: existen pagos confirmados. Cancele los pagos primero.",
    );
  }

  if (input.payablePaidAmount?.greaterThan(0)) {
    throw new ServiceError(
      "CONFLICT",
      "No se puede cancelar: la cuenta por pagar tiene saldo pagado. Revise pagos.",
    );
  }

  if (input.payableCreditedAmount?.greaterThan(0)) {
    throw new ServiceError(
      "CONFLICT",
      "No se puede cancelar: la cuenta por pagar tiene notas de crédito aplicadas.",
    );
  }
}
