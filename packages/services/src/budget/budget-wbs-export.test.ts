import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { WbsViewNode } from "./wbs.service";
import {
  buildBudgetWbsExportTable,
  budgetWbsExportPdfRows,
  budgetWbsExportPdfRowsFromTable,
  parseBudgetWbsExportFilters,
} from "./budget-wbs-export.service";
import { computeTreeGrandTotals } from "./wbs-metrics";

function leafNode(
  code: string,
  name: string,
  opts: {
    material?: string;
    labor?: string;
    qty?: string;
    totalCost?: string;
    totalSale?: string;
  } = {},
): WbsViewNode {
  const material = opts.material ?? "100";
  const labor = opts.labor ?? "50";
  const qty = opts.qty ?? "2";
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
      quantity: qty,
      unitCostDirect: "150",
      unitSalePrice: "200",
      totalCostDirect: totalCost,
      totalSalePrice: totalSale,
      notes: null,
      analysisLines: [
        {
          id: "l1",
          category: "MATERIAL",
          description: "Mat",
          unit: "m2",
          coefficient: "1",
          unitCost: material,
          totalCost: material,
          sortOrder: 0,
          supplierContactId: null,
          notes: null,
        },
        {
          id: "l2",
          category: "LABOR",
          description: "MO",
          unit: "h",
          coefficient: "1",
          unitCost: labor,
          totalCost: labor,
          sortOrder: 1,
          supplierContactId: null,
          notes: null,
        },
      ],
    },
    children: [],
    totalCostDirect: totalCost,
    totalSalePrice: totalSale,
  };
}

function groupNode(code: string, name: string, children: WbsViewNode[]): WbsViewNode {
  return {
    id: code,
    budgetId: "b1",
    parentId: null,
    type: "GROUP",
    code,
    name,
    description: null,
    sortOrder: 0,
    costItem: null,
    children,
    totalCostDirect: "0",
    totalSalePrice: "0",
  };
}

describe("parseBudgetWbsExportFilters", () => {
  it("defaults to breakdown", () => {
    assert.deepEqual(parseBudgetWbsExportFilters({}), { view: "breakdown" });
    assert.deepEqual(parseBudgetWbsExportFilters({ view: "invalid" }), { view: "breakdown" });
  });

  it("accepts totals view", () => {
    assert.deepEqual(parseBudgetWbsExportFilters({ view: "totals" }), { view: "totals" });
  });
});

describe("buildBudgetWbsExportTable", () => {
  const tree: WbsViewNode[] = [
    groupNode("1", "Grupo", [
      leafNode("1.1", "Item A", { totalCost: "300", totalSale: "400" }),
      leafNode("1.2", "Item B", { totalCost: "150", totalSale: "200" }),
    ]),
  ];

  it("breakdown columns include category amounts", () => {
    const { headers, rows } = buildBudgetWbsExportTable(tree, "breakdown");
    assert.equal(headers.length, 9);
    assert.equal(headers[4], "Materiales");
    const totalRow = rows[rows.length - 1]!;
    assert.equal(totalRow[1], "TOTAL GENERAL");
    const grand = computeTreeGrandTotals(tree);
    assert.equal(totalRow[8], grand.totalSalePrice.toFixed(2));
  });

  it("totals columns include cost direct and sale", () => {
    const { headers, rows } = buildBudgetWbsExportTable(tree, "totals");
    assert.equal(headers.length, 6);
    assert.equal(headers[4], "CostoDirecto");
    const totalRow = rows[rows.length - 1]!;
    const grand = computeTreeGrandTotals(tree);
    assert.equal(totalRow[4], grand.totalCostDirect.toFixed(2));
    assert.equal(totalRow[5], grand.totalSalePrice.toFixed(2));
  });

  it("flattens tree depth-first", () => {
    const { rows } = buildBudgetWbsExportTable(tree, "totals");
    assert.equal(rows.length, 4);
    assert.equal(rows[0]![0], "1");
    assert.equal(rows[1]![0], "1.1");
    assert.equal(rows[2]![0], "1.2");
  });
});

describe("budgetWbsExportPdfRows", () => {
  it("maps breakdown row keys for PDF", () => {
    const tree = [leafNode("1", "Item", {})];
    const rows = budgetWbsExportPdfRows(tree, "breakdown");
    assert.equal(rows.length, 2);
    assert.ok("material" in rows[0]!);
    assert.ok("sale" in rows[0]!);
    assert.equal(rows[1]!.name, "TOTAL GENERAL");
  });

  it("pdf rows from table include TOTAL GENERAL", () => {
    const tree: WbsViewNode[] = [leafNode("1", "Item", {})];
    const { rows } = buildBudgetWbsExportTable(tree, "totals");
    const pdfRows = budgetWbsExportPdfRowsFromTable("totals", rows);
    assert.equal(pdfRows.length, 2);
    assert.equal(pdfRows[1]!.name, "TOTAL GENERAL");
  });
});
