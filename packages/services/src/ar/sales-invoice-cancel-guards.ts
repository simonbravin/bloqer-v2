import { Prisma } from "@bloqer/database";
import { ServiceError } from "../types";

export type CancelSalesInvoiceGuardInput = {
  status: string;
  hasReceivable: boolean;
  activeCollectionCount: number;
  receivablePaidAmount: Prisma.Decimal | null;
};

/** BR-AR-004 / Proc-CANCEL-AR-001: block cancel when collections exist or receivable was collected. */
export function assertCanCancelSalesInvoice(input: CancelSalesInvoiceGuardInput): void {
  if (input.status !== "ISSUED") return;

  if (!input.hasReceivable) {
    throw new ServiceError(
      "CONFLICT",
      "La factura emitida no tiene cuenta por cobrar vinculada. Contacte soporte.",
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
}
