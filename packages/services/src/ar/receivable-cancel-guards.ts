import { Prisma } from "@bloqer/database";
import { ServiceError } from "../types";

export type CancelReceivableGuardInput = {
  salesInvoiceStatus: string | null | undefined;
  activeCollectionCount: number;
  paidAmount: Prisma.Decimal;
};

export function assertCanCancelReceivableDirect(input: CancelReceivableGuardInput): void {
  if (input.salesInvoiceStatus === "ISSUED") {
    throw new ServiceError(
      "CONFLICT",
      "Anule la factura de venta asociada; no cancele la cuenta por cobrar directamente.",
    );
  }
  if (input.activeCollectionCount > 0) {
    throw new ServiceError(
      "CONFLICT",
      "No se puede cancelar: existen cobranzas confirmadas. Cancele las cobranzas primero.",
    );
  }
  if (input.paidAmount.greaterThan(0)) {
    throw new ServiceError(
      "CONFLICT",
      "No se puede cancelar una cuenta con pagos parciales. Revisar en módulo de Cobranzas.",
    );
  }
}
