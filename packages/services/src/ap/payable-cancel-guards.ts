import { Prisma } from "@bloqer/database";
import { ServiceError } from "../types";

export type CancelPayableGuardInput = {
  supplierInvoiceStatus: string | null | undefined;
  activePaymentCount: number;
  paidAmount: Prisma.Decimal;
};

export function assertCanCancelPayableDirect(input: CancelPayableGuardInput): void {
  if (input.supplierInvoiceStatus === "ISSUED") {
    throw new ServiceError(
      "CONFLICT",
      "Anule la factura de proveedor asociada; no cancele la cuenta por pagar directamente.",
    );
  }
  if (input.activePaymentCount > 0) {
    throw new ServiceError(
      "CONFLICT",
      "No se puede cancelar: existen pagos confirmados. Cancele los pagos primero.",
    );
  }
  if (input.paidAmount.greaterThan(0)) {
    throw new ServiceError(
      "CONFLICT",
      "No se puede cancelar una cuenta con pagos. Cancele los pagos primero.",
    );
  }
}
