import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Prisma } from "@bloqer/database";
import { computeCostExposureLayers } from "./cost-exposure";

describe("computeCostExposureLayers [BR-COS-002]", () => {
  it("matches COST_FORMULAS §1.7 example (OC 10k / factura 4k)", () => {
    const committed = new Prisma.Decimal(10000);
    const accrued = new Prisma.Decimal(4000);
    const accruedLinked = new Prisma.Decimal(4000);
    const { openCommitted, expectedCostExposure } = computeCostExposureLayers({
      committed,
      accrued,
      accruedLinked,
    });
    assert.equal(openCommitted.toFixed(2), "6000.00");
    assert.equal(expectedCostExposure.toFixed(2), "10000.00");
  });

  it("does not reduce open_committed for direct (unlinked) accrual on same WBS", () => {
    const committed = new Prisma.Decimal(10000);
    const accruedDirect = new Prisma.Decimal(3000);
    const accrued = accruedDirect; // no PO-linked invoice yet
    const accruedLinked = new Prisma.Decimal(0);
    const { openCommitted, expectedCostExposure } = computeCostExposureLayers({
      committed,
      accrued,
      accruedLinked,
    });
    assert.equal(openCommitted.toFixed(2), "10000.00");
    assert.equal(expectedCostExposure.toFixed(2), "13000.00");
  });

  it("floors open_committed at zero when over-invoiced vs commitment", () => {
    const { openCommitted, expectedCostExposure } = computeCostExposureLayers({
      committed: new Prisma.Decimal(5000),
      accrued: new Prisma.Decimal(8000),
      accruedLinked: new Prisma.Decimal(8000),
    });
    assert.equal(openCommitted.toFixed(2), "0.00");
    assert.equal(expectedCostExposure.toFixed(2), "8000.00");
  });

  it("keeps exposure correct when unlinked accrued sits beside a commitment", () => {
    // committed 10k + orphan/direct accrued 3k (not linked) → open 10k, exposure 13k
    const { openCommitted, expectedCostExposure } = computeCostExposureLayers({
      committed: new Prisma.Decimal(10000),
      accrued: new Prisma.Decimal(3000),
      accruedLinked: new Prisma.Decimal(0),
    });
    assert.equal(openCommitted.toFixed(2), "10000.00");
    assert.equal(expectedCostExposure.toFixed(2), "13000.00");
  });

  it("partial linked accrual reduces open_committed only", () => {
    const { openCommitted, expectedCostExposure } = computeCostExposureLayers({
      committed: new Prisma.Decimal(10000),
      accrued: new Prisma.Decimal(7000), // 4k linked + 3k orphan/direct
      accruedLinked: new Prisma.Decimal(4000),
    });
    assert.equal(openCommitted.toFixed(2), "6000.00");
    assert.equal(expectedCostExposure.toFixed(2), "13000.00");
  });
});
