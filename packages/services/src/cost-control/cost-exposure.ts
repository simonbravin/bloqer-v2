import { Prisma } from "@bloqer/database";

const ZERO = new Prisma.Decimal(0);

/**
 * Canonical cost exposure layers ([BR-COS-002] / COST_FORMULAS.md §1).
 *
 * open_committed = max(0, committed − accrued_linked_to_commitments)
 * expected_cost_exposure = accrued + open_committed
 *
 * `received` is informational and must NOT enter exposure.
 */
export function computeCostExposureLayers(input: {
  committed: Prisma.Decimal;
  accrued: Prisma.Decimal;
  /** Accrued that consumes a commitment (PO-linked invoice / approved subcontract cert). */
  accruedLinked: Prisma.Decimal;
}): {
  openCommitted: Prisma.Decimal;
  expectedCostExposure: Prisma.Decimal;
} {
  const openCommitted = Prisma.Decimal.max(ZERO, input.committed.sub(input.accruedLinked));
  const expectedCostExposure = input.accrued.add(openCommitted);
  return { openCommitted, expectedCostExposure };
}
