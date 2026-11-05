import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import type { ProjectCostControlReport, CostControlRow, CostControlTotals } from "../cost-control/cost-control-types";
import { sliceCostControlReportByCostType } from "../cost-control/cost-type-slice";
import type { MaterialVarianceReport } from "../reports/material-variance.service";
import type { ServiceContext } from "../types";
import { ServiceError } from "../types";
import { buildCsv, parseBuiltCsv } from "./csv-export.service";
import { safeReportFilename } from "./filename.service";
import type { ReportCsvPayload } from "./report-export.types";

const ctx: ServiceContext = { tenantId: "synthetic", companyId: null, actorUserId: "synthetic", roles: ["OWNER"] };
const amounts = ["budgetTotalCost", "budgetTotalSale", "certifiedIssued", "certifiedApproved", "committedCost", "receivedCost", "accruedCost", "paidCost", "operationalProgressQty", "openCommittedCost", "expectedCostExposure", "remainingBudgetCost", "costVariance", "projectedMargin"];
const totals = { ...Object.fromEntries(amounts.map((key) => [key, "100.00"])), inventoryConsumedCost: null } as CostControlTotals;
const row: CostControlRow = {
  ...totals, wbsNodeId: "w1", wbsCode: "1", wbsName: "Synthetic material", unit: "un", budgetQty: "10",
  budgetUnitCost: "10.00", budgetUnitSale: "12.00", qtyCommitted: null, qtyReceived: null, qtyConsumed: "2",
  submittedProgressQty: "0", pctPurchased: null, pctReceived: null, pctPhysicalProgress: null, pctEconomic: null, pctExposure: null,
  flags: { overBudget: false, overCertified: false, missingBudget: false }, byCostType: [],
};
const report: ProjectCostControlReport = {
  type: "REPORT", currency: "USD", projectId: "project", budgetId: "budget", budgetName: "Synthetic baseline", budgetStatus: "APPROVED",
  availableBudgets: [], rows: [row], totals, unallocatedCommittedCost: "0.00", unallocatedReceivedCost: "0.00", unallocatedAccruedCost: "0.00", unallocatedPaidCost: "0.00", unallocatedInventoryConsumedCost: null,
  warnings: ["Sin valuación: el consumo carece de moneda y origen trazables."], sectionsExcluded: [],
};
const material: MaterialVarianceReport = {
  type: "REPORT", currency: "USD", projectId: "project", budgetId: "budget", budgetName: "Synthetic baseline",
  byWbs: [
    { wbsNodeId: "w1", wbsCode: "1", wbsName: "Unvalued", budgetMaterial: "100.00", consumedCost: null, variance: null, variancePct: null },
    { wbsNodeId: "w2", wbsCode: "2", wbsName: "No consumption", budgetMaterial: "100.00", consumedCost: "0.00", variance: "100.00", variancePct: "100.00" },
  ],
  totals: { budgetMaterial: "200.00", consumedCost: null, variance: null }, warnings: report.warnings, sectionsExcluded: [],
};

type Exporters = {
  exportProjectCostControlCsv: (id: string, filters: object, ctx: ServiceContext) => Promise<ReportCsvPayload>;
  exportMaterialVarianceCsv: (id: string, filters: object, ctx: ServiceContext) => Promise<ReportCsvPayload>;
  exportResourceVarianceCsv: (id: string, category: string, filters: object, ctx: ServiceContext) => Promise<ReportCsvPayload>;
  exportProcurementDeviationCsv: (id: string, filters: object, ctx: ServiceContext) => Promise<ReportCsvPayload>;
};

/** Isolate only the report read; exercise the public CSV mapping and real CSV encoder. */
function exporters(failRead = false): Exporters {
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL("./report-export.service.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const readCost = async () => {
    if (failRead) throw new ServiceError("CONFLICT", "Las monedas no son comparables.");
    return report;
  };
  const dependencies: Record<string, unknown> = {
    "../cost-control/cost-control.service": { getProjectCostControl: readCost, sliceCostControlReportByCostType },
    "../reports/material-variance.service": { getMaterialVarianceReport: async () => material },
    "../reports/procurement-deviation.service": {
      getProcurementDeviationReport: async () => ({
        type: "REPORT", currency: "ARS", apAvailable: true, budgetName: "Synthetic baseline",
        byWbs: [],
        unallocated: [{ documentType: "OC", documentCode: "OC-002", description: "Flete", supplierName: "Proveedor", amount: "20.00" }],
        bySupplier: [{ supplierName: "Proveedor", committedCost: "100.00", accruedCost: "30.00", paidCost: "15.00", openCommitted: "70.00" }],
        warnings: [],
      }),
    },
    "../reports/purchase-order-variance-report.service": {
      getPurchaseOrderVarianceReport: async () => ({
        rows: [{
          purchaseOrderCode: "OC-001", purchaseOrderStatus: "CONFIRMED", description: "Yeso",
          wbsCode: "1.2", currency: "USD", unit: "kg", unitPrice: "11.00", discountPct: "0.00",
          budgetUnitCostSnapshot: "10.00", variancePct: "10.00", varianceTier: "NOTE_REQUIRED",
          varianceJustification: "Cambio de precio",
        }],
      }),
    },
    "../resources/resource-variance.service": { getResourceVarianceReport: async () => ({ type: "REPORT", currency: "USD", budgetName: "Synthetic baseline", byWbs: [], totals: { budgetCost: "100.00", accruedCost: "0.00", variance: "100.00" }, warnings: ["Sin permiso AP: facturas excluidas; reporte parcial."] }) },
    "../resources/resource-board-pure": { RESOURCE_BOARD_LABELS_ES: { LABOR: "Mano de obra" }, RESOURCE_BOARD_ROUTE_SEGMENT: { LABOR: "mano-obra" } },
    "../types": { ServiceError },
    "./csv-export.service": { buildCsv, parseBuiltCsv },
    "./filename.service": { safeReportFilename },
  };
  runInNewContext(code, { exports, require: (name: string) => dependencies[name] ?? {} });
  return exports as Exporters;
}

test("cost CSV keeps unvalued row, total and unallocated cells empty and preserves warnings/currency", async () => {
  const result = await exporters().exportProjectCostControlCsv("project", {}, ctx);
  const { headers, rows } = parseBuiltCsv(result.content);
  const consumed = headers.indexOf("ConsumoInventario");
  assert.ok(consumed >= 0);
  for (const code of ["1", "__TOTALES__", "__NO_ASIGNADO__"]) {
    const exported = rows.find((entry) => entry[0] === code)!;
    assert.ok(exported, `Missing ${code}`);
    assert.equal(exported[consumed], "");
  }
  assert.equal(rows.find((entry) => entry[0] === "1")![headers.indexOf("ExposicionEsperada")], "100.00");
  assert.ok(rows.some((entry) => entry[0] === "__AVISO__" && entry[1]!.includes("Sin valuación")));
  assert.ok(rows.every((entry) => entry.length === headers.length && entry.at(-1) === "USD"));
  assert.doesNotMatch(result.content, /\bnull\b|NaN/);
});

test("material CSV distinguishes unknown valuation from actual zero and does not export a false savings total", async () => {
  const result = await exporters().exportMaterialVarianceCsv("project", {}, ctx);
  const { headers, rows } = parseBuiltCsv(result.content);
  const consumed = headers.indexOf("ConsumoDevengado"), variance = headers.indexOf("Variacion");
  assert.equal(rows.find((entry) => entry[0] === "1")![consumed], "");
  assert.equal(rows.find((entry) => entry[0] === "1")![variance], "");
  assert.equal(rows.find((entry) => entry[0] === "2")![consumed], "0.00");
  assert.equal(rows.find((entry) => entry[0] === "2")![variance], "100.00");
  assert.equal(rows.find((entry) => entry[0] === "TOTAL")![consumed], "");
  assert.equal(rows.find((entry) => entry[0] === "TOTAL")![variance], "");
  assert.ok(rows.some((entry) => entry[0] === "__AVISO__" && entry[1]!.includes("Sin valuación")));
  assert.ok(rows.every((entry) => entry.length === headers.length && entry.at(-1) === "USD"));
});

test("cost export propagates a comparability failure instead of returning an apparently complete file", async () => {
  await assert.rejects(exporters(true).exportProjectCostControlCsv("project", {}, ctx), (error: unknown) => error instanceof ServiceError && error.code === "CONFLICT" && error.message.includes("monedas"));
});

test("resource CSV preserves restricted-source warnings instead of hiding the report's partial scope", async () => {
  const result = await exporters().exportResourceVarianceCsv("project", "LABOR", {}, ctx);
  const { headers, rows } = parseBuiltCsv(result.content);
  assert.ok(rows.some((entry) => entry[0] === "__AVISO__" && entry[1]!.includes("reporte parcial")));
  assert.ok(rows.every((entry) => entry.length === headers.length && entry.at(-1) === "USD"));
});

test("purchase analysis CSV keeps paid and unallocated amounts under their headings and preserves historical OC currency", async () => {
  const result = await exporters().exportProcurementDeviationCsv("project", {}, ctx);
  const { headers, rows } = parseBuiltCsv(result.content);
  assert.ok(rows.every((row) => row.length === headers.length));
  const find = (type: string) => Object.fromEntries(headers.map((header, index) => [
    header,
    rows.find((row) => row[0] === type)?.[index],
  ]));
  assert.equal(find("PROVEEDOR").Pagado, "15.00");
  assert.equal(find("PROVEEDOR").ComprometidoAbierto, "70.00");
  assert.equal(find("PROVEEDOR").VariacionPct, "");
  assert.equal(find("OC").ImporteSinImputacion, "20.00");
  assert.equal(find("OC").Devengado, "");
  assert.equal(find("DESVIO_OC").Moneda, "USD");
  assert.equal(find("DESVIO_OC").CostoUnitarioReferencia, "10.00");
});
