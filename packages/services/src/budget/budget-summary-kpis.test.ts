import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeBudgetSummaryKpis } from "./budget-summary-kpis";
import type { WbsViewNode } from "./wbs.service";

function leafNode(
  code: string,
  name: string,
  opts: { totalCost?: string; totalSale?: string } = {},
): WbsViewNode {
  const totalCost = opts.totalCost ?? "300";
  const totalSale = opts.totalSale ?? "400";
  return {
    id: code,
    budgetId: "b1",
    parentId: null,
    type: "ITEM",
    code,
    name,
    description: null,
    sortOrder: 0,
    costItem: {
      id: `ci-${code}`,
      unit: "m2",
      quantity: "1",
      unitCostDirect: totalCost,
      unitSalePrice: totalSale,
      totalCostDirect: totalCost,
      totalSalePrice: totalSale,
      notes: null,
      analysisLines: [],
    },
    children: [],
    totalCostDirect: totalCost,
    totalSalePrice: totalSale,
  };
}

describe("computeBudgetSummaryKpis", () => {
  it("computes margin, cost/sale, costliest leaf and top group incidence", () => {
    const tree: WbsViewNode[] = [
      {
        id: "1",
        budgetId: "b1",
        parentId: null,
        type: "GROUP",
        code: "1",
        name: "Capítulo A",
        description: null,
        sortOrder: 0,
        costItem: null,
        children: [
          leafNode("1.1", "Cara", { totalCost: "300", totalSale: "400" }),
        ],
        totalCostDirect: "0",
        totalSalePrice: "0",
      },
      {
        id: "2",
        budgetId: "b1",
        parentId: null,
        type: "GROUP",
        code: "2",
        name: "Capítulo B",
        description: null,
        sortOrder: 1,
        costItem: null,
        children: [
          leafNode("2.1", "Cola", { totalCost: "150", totalSale: "200" }),
        ],
        totalCostDirect: "0",
        totalSalePrice: "0",
      },
    ];

    const k = computeBudgetSummaryKpis(tree);
    assert.equal(k.totalCostDirect, 450);
    assert.equal(k.totalSalePrice, 600);
    assert.equal(k.margin, 150);
    assert.ok(k.marginPct != null && Math.abs(k.marginPct - 25) < 0.01);
    assert.ok(k.costToSalePct != null && Math.abs(k.costToSalePct - 75) < 0.01);
    assert.equal(k.costliestLeaf?.code, "1.1");
    assert.equal(k.costliestLeaf?.amountDisplay, "300.00");
    // Distinct from leaf: highest-incidence CHAPTER
    assert.equal(k.topIncidenceGroup?.code, "1");
    assert.ok(
      k.topIncidenceGroup != null &&
        Math.abs(k.topIncidenceGroup.incidencePct - (300 / 450) * 100) < 0.01,
    );
  });

  it("skips zero-cost leaves for costliest", () => {
    const tree = [
      leafNode("1", "Zero", { totalCost: "0", totalSale: "0" }),
      leafNode("2", "Has", { totalCost: "10", totalSale: "20" }),
    ];
    const k = computeBudgetSummaryKpis(tree);
    assert.equal(k.costliestLeaf?.code, "2");
    assert.equal(k.topIncidenceGroup, null);
  });
});
