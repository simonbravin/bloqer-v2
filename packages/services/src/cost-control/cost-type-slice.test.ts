import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sliceCostControlReportByCostType, costTypeBucketHasActivity } from "./cost-type-slice";
import type { CostControlRow, CostTypeBucket, ProjectCostControlReport } from "./cost-control-types";

function bucket(partial: Partial<CostTypeBucket> & Pick<CostTypeBucket, "costType">): CostTypeBucket {
  return {
    label: partial.costType,
    budgetTotalCost: "0",
    committedCost: "0",
    accruedCost: "0",
    paidCost: "0",
    inventoryConsumedCost: "0",
    openCommittedCost: "0",
    expectedCostExposure: "0",
    costVariance: "0",
    ...partial,
  };
}

function row(partial: Partial<CostControlRow> & Pick<CostControlRow, "wbsNodeId" | "byCostType">): CostControlRow {
  return {
    wbsCode: "1.1",
    wbsName: "Partida",
    unit: "gl",
    budgetQty: "1",
    budgetUnitCost: "0",
    budgetTotalCost: "0",
    budgetUnitSale: "0",
    budgetTotalSale: "0",
    certifiedIssued: "0",
    certifiedApproved: "0",
    committedCost: "0",
    receivedCost: "0",
    accruedCost: "0",
    paidCost: "0",
    inventoryConsumedCost: "0",
    qtyCommitted: "0",
    qtyReceived: "0",
    qtyConsumed: "0",
    operationalProgressQty: "0",
    submittedProgressQty: "0",
    openCommittedCost: "0",
    expectedCostExposure: "0",
    remainingBudgetCost: "0",
    costVariance: "0",
    projectedMargin: "0",
    pctPurchased: null,
    pctReceived: null,
    pctPhysicalProgress: null,
    pctEconomic: null,
    pctExposure: null,
    flags: { overBudget: false, overCertified: false, missingBudget: false },
    ...partial,
  };
}

describe("sliceCostControlReportByCostType [D-099]", () => {
  it("keeps only the selected bucket and computes remaining = budget − exposure", () => {
    const report = {
      type: "REPORT",
      projectId: "p",
      budgetId: "b",
      budgetName: "Base",
      rows: [
        row({
          wbsNodeId: "w1",
          byCostType: [
            bucket({
              costType: "LABOR",
              budgetTotalCost: "1000.00",
              accruedCost: "400.00",
              expectedCostExposure: "400.00",
              costVariance: "600.00",
            }),
            bucket({
              costType: "MATERIAL",
              budgetTotalCost: "5000.00",
              committedCost: "2000.00",
              expectedCostExposure: "2000.00",
            }),
          ],
        }),
      ],
      totals: {
        budgetTotalCost: "6000.00",
        budgetTotalSale: "8000.00",
        certifiedIssued: "0",
        certifiedApproved: "0",
        committedCost: "2000.00",
        receivedCost: "0",
        accruedCost: "400.00",
        paidCost: "0",
        inventoryConsumedCost: "0",
        operationalProgressQty: "0",
        openCommittedCost: "0",
        expectedCostExposure: "2400.00",
        remainingBudgetCost: "3600.00",
        costVariance: "3600.00",
        projectedMargin: "5600.00",
      },
    } as unknown as ProjectCostControlReport;

    const sliced = sliceCostControlReportByCostType(report, "LABOR");
    assert.equal(sliced.rows.length, 1);
    assert.equal(sliced.rows[0]!.budgetTotalCost, "1000.00");
    assert.equal(sliced.rows[0]!.accruedCost, "400.00");
    assert.equal(sliced.rows[0]!.remainingBudgetCost, "600.00");
    assert.equal(sliced.totals.budgetTotalCost, "1000.00");
    assert.equal(sliced.totals.expectedCostExposure, "400.00");
    assert.equal(sliced.totals.remainingBudgetCost, "600.00");
    assert.equal(sliced.totals.budgetTotalSale, "0");
    assert.equal(sliced.totals.projectedMargin, "0");
    assert.equal(sliced.unallocatedCommittedCost, "0");
    assert.equal(sliced.rows[0]!.flags.overCertified, false);
  });

  it("marks overBudget from the bucket, not the whole partida", () => {
    const report = {
      type: "REPORT",
      rows: [
        row({
          wbsNodeId: "w1",
          flags: { overBudget: true, overCertified: true, missingBudget: false },
          byCostType: [
            bucket({
              costType: "LABOR",
              budgetTotalCost: "1000.00",
              expectedCostExposure: "200.00",
              costVariance: "800.00",
            }),
          ],
        }),
      ],
      totals: { budgetTotalCost: "0" },
      unallocatedCommittedCost: "99.00",
    } as unknown as ProjectCostControlReport;
    const sliced = sliceCostControlReportByCostType(report, "LABOR");
    assert.equal(sliced.rows[0]!.flags.overBudget, false);
    assert.equal(sliced.unallocatedCommittedCost, "0");
  });

  it("drops partidas without activity in the selected type", () => {
    const report = {
      type: "REPORT",
      rows: [
        row({
          wbsNodeId: "empty",
          byCostType: [bucket({ costType: "LABOR" })],
        }),
      ],
      totals: { budgetTotalCost: "0" },
    } as unknown as ProjectCostControlReport;
    const sliced = sliceCostControlReportByCostType(report, "LABOR");
    assert.equal(sliced.rows.length, 0);
  });

  it("treats paid-only buckets as activity", () => {
    assert.equal(
      costTypeBucketHasActivity(bucket({ costType: "LABOR", paidCost: "10.00" })),
      true,
    );
  });
});
