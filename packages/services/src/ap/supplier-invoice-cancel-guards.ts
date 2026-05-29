import { Prisma } from "@bloqer/database";
import { ServiceError } from "../types";

export type CancelSupplierInvoiceGuardInput = {
  status: string;
  hasPayable: boolean;
  activePaymentCount: number;
  payablePaidAmount: Prisma.Decimal | null;
};

/** BR-AP-003 / Proc-CANCEL-AP-001: block cancel when payments exist or payable was paid. */
export function assertCanCancelSupplierInvoice(input: CancelSupplierInvoiceGuardInput): void {
  if (input.status !== "ISSUED") return;

  if (!input.hasPayable) {
    throw new ServiceError(
      "CONFLICT",
      "La factura emitida no tiene cuenta por pagar vinculada. Contacte soporte.",
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
}
