import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { WbsViewNode } from "./wbs.service";
import { computeTreeGrandTotals, computeTreeGrandTotalsExact, computeUnitCategoryCostsExact, computeWbsRowMetricsExact } from "./wbs-metrics";

function item(id: string, cost: string, quantity = "1", category = "MATERIAL"): WbsViewNode {
  return {
    id, budgetId: "budget", parentId: null, code: id, type: "ITEM", name: id, description: null, sortOrder: 0, children: [], totalCostDirect: cost, totalSalePrice: cost,
    costItem: {
      id: `cost-${id}`, unit: "m2", quantity, unitCostDirect: cost, unitSalePrice: cost, totalCostDirect: cost, totalSalePrice: cost, notes: null,
      analysisLines: [{ id: `line-${id}`, category, description: id, unit: "un", coefficient: "1", unitCost: cost, totalCost: cost, partidaQuantity: null, isLumpSum: false, productId: null, supplierContactId: null, sortOrder: 0, notes: null }],
    },
  };
}

function group(children: WbsViewNode[]): WbsViewNode {
  return { ...item("group", "0"), children, type: "GROUP", costItem: null };
}

describe("exact WBS row metrics", () => {
  it("keeps nested 0.1 + 0.2 exact for UI and export", () => {
    const nodes = [group([item("a", "0.1"), group([item("b", "0.2")])])];
    assert.equal(computeTreeGrandTotals(nodes).totalCostDirect, 0.3);
    assert.equal(computeTreeGrandTotalsExact(nodes).totalCostDirect, "0.30");
    assert.equal(computeTreeGrandTotalsExact(nodes).byCategory.MATERIAL, "0.30");
  });

  it("preserves cents beyond IEEE-safe money precision", () => {
    const metrics = computeTreeGrandTotalsExact([item("a", "99999999999999.91"), item("b", "0.02")]);
    assert.equal(metrics.totalCostDirect, "99999999999999.93");
    assert.equal(metrics.byCategory.MATERIAL, "99999999999999.93");
  });

  it("multiplies legacy four-decimal unit contributions before rounding half-up", () => {
    const node = item("legacy", "1.005", "2");
    assert.equal(computeUnitCategoryCostsExact(node).MATERIAL, "1.005");
    assert.equal(computeWbsRowMetricsExact(node).byCategory.MATERIAL, "2.01");
    assert.equal(computeWbsRowMetricsExact(node).totalCostDirect, "1.01");
  });

  it("uses contribution and item quantity, preserving total-partida resource quantities", () => {
    const node = item("resource", "7692.31", "390.0000");
    node.costItem!.analysisLines[0]!.partidaQuantity = "500";
    node.costItem!.analysisLines[0]!.coefficient = "1.2821";
    node.costItem!.analysisLines[0]!.unitCost = "6000";
    node.totalCostDirect = "3000000.90";
    assert.equal(computeWbsRowMetricsExact(node).byCategory.MATERIAL, "3000000.90");
    assert.equal(computeWbsRowMetricsExact(node).quantity, "390.0000");
  });

  it("keeps OTHER in the item's grand total without inventing a new visible column", () => {
    const metrics = computeWbsRowMetricsExact(item("other", "12.34", "1", "OTHER"));
    assert.equal(metrics.totalCostDirect, "12.34");
    assert.equal(metrics.byCategory.MATERIAL, "0.00");
    assert.equal(Object.keys(metrics.byCategory).length, 4);
  });
});
