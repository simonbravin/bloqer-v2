import { Prisma } from "@bloqer/database";
import { ServiceError } from "../types";
import { PO_RECEIPT_ELIGIBLE_STATUSES } from "./procurement-constants";

export function assertPoEligibleForReceipt(status: string): void {
  if (!(PO_RECEIPT_ELIGIBLE_STATUSES as readonly string[]).includes(status)) {
    throw new ServiceError(
      "CONFLICT",
      `No se puede registrar recepción en una orden con estado "${status}". Primero emita la orden.`,
    );
  }
}

export function assertReceiptQtyWithinRemaining(
  qtyReceived: Prisma.Decimal,
  remaining: Prisma.Decimal,
  description: string,
): void {
  if (qtyReceived.lessThanOrEqualTo(0)) {
    throw new ServiceError("CONFLICT", `La cantidad recibida debe ser mayor a cero: ${description}`);
  }
  if (qtyReceived.greaterThan(remaining)) {
    throw new ServiceError(
      "CONFLICT",
      `La cantidad recibida (${qtyReceived}) excede la cantidad pendiente (${remaining}) para: ${description}`,
    );
  }
}
