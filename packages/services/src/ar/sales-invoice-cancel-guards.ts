import { Prisma } from "@bloqer/database";
import { ServiceError } from "../types";

export type CancelSalesInvoiceGuardInput = {
  status: string;
  documentKind?: string;
  hasReceivable: boolean;
  activeCollectionCount: number;
  receivablePaidAmount: Prisma.Decimal | null;
  /** [D-115] creditedAmount from applied credit notes */
  receivableCreditedAmount?: Prisma.Decimal | null;
  /** [BR-NC-005] ISSUED NC/ND referencing this invoice */
  activeCreditDebitNoteCount?: number;
};

/** BR-AR-004 / Proc-CANCEL-AR-001 / [D-115]: block cancel when collections, credits, or child notes exist. */
export function assertCanCancelSalesInvoice(input: CancelSalesInvoiceGuardInput): void {
  if (input.documentKind === "CREDIT_NOTE") {
    throw new ServiceError(
      "VALIDATION",
      "Usá anular nota de crédito para este comprobante.",
    );
  }

  if (input.status !== "ISSUED") return;

  if (!input.hasReceivable) {
    throw new ServiceError(
      "CONFLICT",
      "La factura emitida no tiene cuenta por cobrar vinculada. Contacte soporte.",
    );
  }

  if ((input.activeCreditDebitNoteCount ?? 0) > 0) {
    throw new ServiceError(
      "CONFLICT",
      "No se puede anular: existen notas de crédito o débito emitidas. Anulá las notas primero.",
    );
  }

  if (input.activeCollectionCount > 0) {
    throw new ServiceError(
      "CONFLICT",
      "No se puede cancelar: existen cobranzas confirmadas. Cancele las cobranzas primero.",
    );
  }

  if (input.receivablePaidAmount?.greaterThan(0)) {
    throw new ServiceError(
      "CONFLICT",
      "No se puede cancelar: la cuenta por cobrar tiene saldo cobrado. Revise cobranzas.",
    );
  }

  if (input.receivableCreditedAmount?.greaterThan(0)) {
    throw new ServiceError(
      "CONFLICT",
      "No se puede cancelar: la cuenta por cobrar tiene notas de crédito aplicadas.",
    );
  }
}
