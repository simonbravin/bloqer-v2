import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { WbsViewNode } from "./wbs.service";
import {
  buildBudgetWbsExportTable,
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
          partidaQuantity: null,
          isLumpSum: false,
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
          partidaQuantity: null,
          isLumpSum: false,
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
  it("legacy view=breakdown defaults", () => {
    const f = parseBudgetWbsExportFilters({});
    assert.equal(f.view, "breakdown");
    assert.equal(f.base, "cost");
    assert.equal(f.detail, "breakdown");
    assert.equal(f.showIncidence, false);
  });

  it("legacy view=totals", () => {
    const f = parseBudgetWbsExportFilters({ view: "totals" });
    assert.equal(f.view, "totals");
    assert.equal(f.detail, "compact");
  });

  it("accepts full EDT axes + incidence", () => {
    const f = parseBudgetWbsExportFilters({
      base: "sale",
      scale: "unit",
      detail: "breakdown",
      incidence: "1",
    });
    assert.equal(f.base, "sale");
    assert.equal(f.scale, "unit");
    assert.equal(f.detail, "compact"); // sale forces compact
    assert.equal(f.showIncidence, true);
    assert.equal(f.view, "totals");
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
    assert.equal(totalRow[8], grand.totalCostDirect.toFixed(2));
  });

  it("totals columns include cost direct", () => {
    const { headers, rows } = buildBudgetWbsExportTable(tree, "totals");
    assert.equal(headers.length, 5);
    assert.equal(headers[4], "CostoDirecto");
    const totalRow = rows[rows.length - 1]!;
    const grand = computeTreeGrandTotals(tree);
    assert.equal(totalRow[4], grand.totalCostDirect.toFixed(2));
  });

  it("unitario adds unit columns alongside totals", () => {
    const { headers, rows } = buildBudgetWbsExportTable(tree, {
      base: "cost",
      scale: "unit",
      detail: "compact",
      showIncidence: false,
    });
    assert.deepEqual(headers.slice(4), ["CostoDirecto_u", "CostoDirecto"]);
    const leafA = rows.find((r) => r[0] === "1.1")!;
    assert.equal(leafA[5], "300.00"); // total always present
    const totalRow = rows[rows.length - 1]!;
    assert.equal(totalRow[4], ""); // unit blank on TOTAL
    assert.equal(totalRow[5], computeTreeGrandTotals(tree).totalCostDirect.toFixed(2));
  });

  it("breakdown + unitario keeps header/row length and blank unit TOTAL cells", () => {
    const { headers, rows } = buildBudgetWbsExportTable(tree, {
      base: "cost",
      scale: "unit",
      detail: "breakdown",
      showIncidence: true,
    });
    assert.equal(headers.length, 15); // 4 fixed + 10 money + incidencia
    assert.deepEqual(headers.slice(4, 14), [
      "Materiales_u",
      "ManoDeObra_u",
      "Equipos_u",
      "Subcontrato_u",
      "CostoDirecto_u",
      "Materiales",
      "ManoDeObra",
      "Equipos",
      "Subcontrato",
      "CostoDirecto",
    ]);
    for (const row of rows) {
      assert.equal(row.length, headers.length);
    }
    const totalRow = rows[rows.length - 1]!;
    assert.deepEqual(totalRow.slice(4, 9), ["", "", "", "", ""]);
    assert.equal(totalRow[13], computeTreeGrandTotals(tree).totalCostDirect.toFixed(2));
    assert.equal(totalRow[14], "100.00%");

    const pdfRows = budgetWbsExportPdfRowsFromTable(
      {
        base: "cost",
        scale: "unit",
        detail: "breakdown",
        showIncidence: true,
        view: "breakdown",
      },
      rows,
    );
    const pdfTotal = pdfRows[pdfRows.length - 1]!;
    assert.equal(pdfTotal.c13, totalRow[13]);
    assert.equal(pdfTotal.c14, "100.00%");
  });

  it("sale + incidence adds IncidenciaPct and uses sale totals", () => {
    const { headers, rows } = buildBudgetWbsExportTable(tree, {
      base: "sale",
      scale: "total",
      detail: "compact",
      showIncidence: true,
    });
    assert.ok(headers.includes("IncidenciaPct"));
    assert.ok(headers.includes("TotalVenta"));
    const leafA = rows.find((r) => r[0] === "1.1")!;
    // 400 / 600 = 66.67% (export uses dot decimals, same as money cols)
    assert.equal(leafA[leafA.length - 1], "66.67%");
    const totalRow = rows[rows.length - 1]!;
    assert.equal(totalRow[totalRow.length - 1], "100.00%");
  });

  it("group incidence is share of rolled-up total", () => {
    const { rows } = buildBudgetWbsExportTable(tree, {
      base: "cost",
      scale: "total",
      detail: "compact",
      showIncidence: true,
    });
    const group = rows.find((r) => r[0] === "1")!;
    assert.equal(group[group.length - 1], "100.00%");
  });

  it("flattens tree depth-first", () => {
    const { rows } = buildBudgetWbsExportTable(tree, "totals");
    assert.equal(rows.length, 4);
    assert.equal(rows[0]![0], "1");
    assert.equal(rows[1]![0], "1.1");
    assert.equal(rows[2]![0], "1.2");
  });
});

describe("budgetWbsExportPdfRowsFromTable", () => {
  it("maps rows for PDF with dynamic columns", () => {
    const tree = [leafNode("1", "Item", {})];
    const filters = parseBudgetWbsExportFilters({ view: "breakdown" });
    const { rows } = buildBudgetWbsExportTable(tree, filters);
    const pdfRows = budgetWbsExportPdfRowsFromTable(filters, rows);
    assert.equal(pdfRows.length, 2);
    assert.equal(pdfRows[1]!.name, "TOTAL GENERAL");
    assert.ok("c4" in pdfRows[0]!);
  });
});
