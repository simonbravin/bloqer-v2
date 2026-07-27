import { Prisma } from "@bloqer/database";

const ZERO = new Prisma.Decimal(0);

/** Cap for BR-PUR-006 over-receipt tolerance (company setting). */
export const OVER_RECEIPT_TOLERANCE_PCT_MAX = new Prisma.Decimal(5);

/** Cap for BR-PUR-012 invoice match tolerance (company setting). */
export const INVOICE_MATCH_TOLERANCE_PCT_MAX = new Prisma.Decimal(25);

/**
 * Max qty allowed on this receipt line given order qty, already received, and tolerance %.
 * Total received after this receipt may not exceed orderQty × (1 + tol/100).
 */
export function maxReceivableQtyWithTolerance(
  orderQuantity: Prisma.Decimal,
  alreadyReceived: Prisma.Decimal,
  tolerancePct: Prisma.Decimal,
): Prisma.Decimal {
  const tol = Prisma.Decimal.max(ZERO, Prisma.Decimal.min(tolerancePct, OVER_RECEIPT_TOLERANCE_PCT_MAX));
  const maxTotal = orderQuantity.mul(new Prisma.Decimal(1).add(tol.div(100)));
  const maxThis = maxTotal.sub(alreadyReceived);
  return maxThis.greaterThan(0) ? maxThis : ZERO;
}

export type ThreeWayLineMatchInput = {
  poLineId: string;
  description: string;
  orderQty: Prisma.Decimal;
  receivedQty: Prisma.Decimal;
  invoicedQty: Prisma.Decimal;
};

export type ThreeWayLineMatchResult = {
  poLineId: string;
  description: string;
  status: "OK" | "WARN";
  message: string | null;
  orderQty: string;
  receivedQty: string;
  invoicedQty: string;
};

/**
 * Per-line 3-way qty check ([BR-PUR-012] / [D-067]).
 * WARN when invoiced qty exceeds received × (1 + tolerance%). Soft only in P2.
 */
export function evaluateThreeWayLineQtyMatch(
  line: ThreeWayLineMatchInput,
  tolerancePct: Prisma.Decimal,
): ThreeWayLineMatchResult {
  const tol = Prisma.Decimal.max(
    ZERO,
    Prisma.Decimal.min(tolerancePct, INVOICE_MATCH_TOLERANCE_PCT_MAX),
  );
  const maxInvoiced = line.receivedQty.mul(new Prisma.Decimal(1).add(tol.div(100)));
  const over = line.invoicedQty.greaterThan(maxInvoiced) && line.receivedQty.greaterThan(0);
  // Also warn if invoiced without any receipt
  const invoicedWithoutReceipt =
    line.invoicedQty.greaterThan(0) && line.receivedQty.lessThanOrEqualTo(0);

  let message: string | null = null;
  if (invoicedWithoutReceipt) {
    message = `${line.description}: hay cantidad facturada (${line.invoicedQty.toFixed(4)}) sin recepción confirmada.`;
  } else if (over) {
    message = `${line.description}: facturado (${line.invoicedQty.toFixed(4)}) supera recibido (${line.receivedQty.toFixed(4)}) más tolerancia ${tol.toFixed(2)}%.`;
  }

  return {
    poLineId: line.poLineId,
    description: line.description,
    status: message ? "WARN" : "OK",
    message,
    orderQty: line.orderQty.toFixed(4),
    receivedQty: line.receivedQty.toFixed(4),
    invoicedQty: line.invoicedQty.toFixed(4),
  };
}

/** Header amount check: invoice total vs received value with tolerance. */
export function invoiceExceedsReceivedWithTolerance(
  invoiceTotal: Prisma.Decimal,
  receivedAmount: Prisma.Decimal,
  tolerancePct: Prisma.Decimal,
): boolean {
  if (receivedAmount.lessThanOrEqualTo(0)) return invoiceTotal.greaterThan(0);
  const tol = Prisma.Decimal.max(
    ZERO,
    Prisma.Decimal.min(tolerancePct, INVOICE_MATCH_TOLERANCE_PCT_MAX),
  );
  const maxAllowed = receivedAmount.mul(new Prisma.Decimal(1).add(tol.div(100)));
  return invoiceTotal.greaterThan(maxAllowed);
}
