import { Prisma } from "@bloqer/database";
import { ServiceError } from "../types";
import { PO_RECEIPT_ELIGIBLE_STATUSES } from "./procurement-constants";
import { maxReceivableQtyWithTolerance } from "./three-way-match-pure";

export function assertPoEligibleForReceipt(status: string): void {
  if (!(PO_RECEIPT_ELIGIBLE_STATUSES as readonly string[]).includes(status)) {
    throw new ServiceError(
      "CONFLICT",
      `No se puede registrar recepción en una orden con estado "${status}". Primero emita la orden.`,
    );
  }
}

/**
 * [BR-PUR-006] / [D-067]: qty must be > 0 and within remaining + over-receipt tolerance.
 * @param remaining orderQty − alreadyReceived (may be computed by caller)
 */
export function assertReceiptQtyWithinRemaining(
  qtyReceived: Prisma.Decimal,
  remaining: Prisma.Decimal,
  description: string,
  opts?: {
    orderQuantity: Prisma.Decimal;
    alreadyReceived: Prisma.Decimal;
    tolerancePct: Prisma.Decimal;
  },
): void {
  if (qtyReceived.lessThanOrEqualTo(0)) {
    throw new ServiceError("CONFLICT", `La cantidad recibida debe ser mayor a cero: ${description}`);
  }

  if (opts) {
    const maxThis = maxReceivableQtyWithTolerance(
      opts.orderQuantity,
      opts.alreadyReceived,
      opts.tolerancePct,
    );
    if (qtyReceived.greaterThan(maxThis)) {
      const tol = opts.tolerancePct;
      throw new ServiceError(
        "CONFLICT",
        `La cantidad recibida (${qtyReceived}) excede el máximo permitido (${maxThis.toFixed(4)}) para: ${description}` +
          (tol.greaterThan(0) ? ` (tolerancia sobrecantidad ${tol.toFixed(2)}%).` : "."),
      );
    }
    return;
  }

  // Legacy path (0% tolerance): cannot exceed remaining
  if (qtyReceived.greaterThan(remaining)) {
    throw new ServiceError(
      "CONFLICT",
      `La cantidad recibida (${qtyReceived}) excede la cantidad pendiente (${remaining}) para: ${description}`,
    );
  }
}
