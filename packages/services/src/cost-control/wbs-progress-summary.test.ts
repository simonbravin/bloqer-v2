import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "@bloqer/database";
import { buildWbsProgressSummary } from "./wbs-progress-summary";

const ZERO = new Prisma.Decimal(0);

test("buildWbsProgressSummary: physical remaining after 70%", () => {
  const s = buildWbsProgressSummary({
    physicalPctAcum: 70,
    physicalQtyAcum: 7,
    certifiedQty: 0,
    certifiedAmount: 0,
    budgetQty: 10,
    budgetTotalSale: 1000,
    budgetTotalCost: 800,
    committedCost: 0,
    accruedCost: 0,
    expectedCostExposure: 0,
  });
  assert.equal(s.physicalPctAcum, "70.00");
  assert.equal(s.physicalRemainingPct, "30.00");
  assert.equal(s.physicalQtyAcum, "7.0000");
});

test("buildWbsProgressSummary: economic remaining and % of sale", () => {
  const s = buildWbsProgressSummary({
    physicalPctAcum: 0,
    physicalQtyAcum: 0,
    certifiedQty: 8,
    certifiedAmount: 800,
    budgetQty: 10,
    budgetTotalSale: 1000,
    budgetTotalCost: 800,
    committedCost: 400,
    accruedCost: 200,
    expectedCostExposure: 500,
  });
  assert.equal(s.certifiedQty, "8.0000");
  assert.equal(s.remainingCertQty, "2.0000");
  assert.equal(s.economicPctOfSale, "80.00");
  assert.equal(s.committedPctOfCost, "50.00");
  assert.equal(s.accruedPctOfCost, "25.00");
  assert.equal(s.expectedExposurePctOfCost, "62.50");
});

test("buildWbsProgressSummary: null % when budget base is zero", () => {
  const s = buildWbsProgressSummary({
    physicalPctAcum: "0",
    physicalQtyAcum: "0",
    certifiedQty: "1",
    certifiedAmount: "100",
    budgetQty: null,
    budgetTotalSale: null,
    budgetTotalCost: ZERO,
    committedCost: "50",
    accruedCost: "10",
    expectedCostExposure: "50",
  });
  assert.equal(s.economicPctOfSale, null);
  assert.equal(s.committedPctOfCost, null);
  assert.equal(s.remainingCertQty, "0.0000");
});

test("buildWbsProgressSummary: null cost layers stay null (not 0%)", () => {
  const s = buildWbsProgressSummary({
    physicalPctAcum: 10,
    physicalQtyAcum: 1,
    certifiedQty: 0,
    certifiedAmount: 0,
    budgetQty: 10,
    budgetTotalSale: 1000,
    budgetTotalCost: 800,
    committedCost: null,
    accruedCost: null,
    expectedCostExposure: null,
  });
  assert.equal(s.committedPctOfCost, null);
  assert.equal(s.accruedPctOfCost, null);
  assert.equal(s.expectedExposurePctOfCost, null);
  assert.equal(s.economicPctOfSale, "0.00");
});
