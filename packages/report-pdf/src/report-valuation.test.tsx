import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import type { ReactElement } from "react";
import * as jsxRuntime from "react/jsx-runtime";
import type { DocumentProps } from "@react-pdf/renderer";
import ts from "typescript";
import type { CostControlTotals, MaterialVarianceReport, ProjectCostControlReport, ServiceContext } from "@bloqer/services";
import type { PdfReportBranding } from "./branding/pdf-branding.types";
import { safeReportFilename } from "./filename.service";
import { CostControlReportPdfDocument } from "./pdf/cost-control-pdf";
import { ProjectSimpleTablePdfDocument } from "./pdf/project-simple-table-pdf";
import { renderReportPdfToBuffer } from "./pdf/pdf-renderer.service";
import type { ReportPdfPayload } from "./pdf/pdf-export.types";

const warning = "Sin valuación: falta moneda y origen trazables del consumo.";
const branding: PdfReportBranding = { tenantName: "Synthetic tenant", companyDisplayName: "Synthetic company", projectLabel: "Synthetic project", generatedByLabel: "Tests", generatedAtIso: "2026-11-04T12:00:00.000Z", logoDataUri: null };
const ctx: ServiceContext = { tenantId: "synthetic", companyId: null, actorUserId: "synthetic", roles: ["OWNER"] };
const material: MaterialVarianceReport = {
  type: "REPORT", currency: "USD", projectId: "project", budgetId: "budget", budgetName: "Synthetic baseline",
  byWbs: [
    { wbsNodeId: "w1", wbsCode: "1", wbsName: "Unvalued", budgetMaterial: "100.00", consumedCost: null, variance: null, variancePct: null },
    { wbsNodeId: "w2", wbsCode: "2", wbsName: "No consumption", budgetMaterial: "100.00", consumedCost: "0.00", variance: "100.00", variancePct: "100.00" },
  ], totals: { budgetMaterial: "200.00", consumedCost: null, variance: null }, warnings: [warning], sectionsExcluded: [],
};
const moneyKeys = ["budgetTotalCost", "budgetTotalSale", "certifiedIssued", "certifiedApproved", "committedCost", "receivedCost", "accruedCost", "paidCost", "operationalProgressQty", "openCommittedCost", "expectedCostExposure", "remainingBudgetCost", "costVariance", "projectedMargin"];
const report: ProjectCostControlReport = {
  type: "REPORT", currency: "USD", projectId: "project", budgetId: "budget", budgetName: "Synthetic baseline", budgetStatus: "APPROVED", availableBudgets: [], rows: [],
  totals: { ...Object.fromEntries(moneyKeys.map((key) => [key, "100.00"])), inventoryConsumedCost: null } as CostControlTotals,
  unallocatedCommittedCost: "0.00", unallocatedReceivedCost: "0.00", unallocatedAccruedCost: "0.00", unallocatedPaidCost: "0.00", unallocatedInventoryConsumedCost: null,
  warnings: [warning], sectionsExcluded: [],
};

type Exporters = {
  exportMaterialVariancePdf: (id: string, filters: object, ctx: ServiceContext) => Promise<ReportPdfPayload>;
  exportProjectCostControlPdf: (id: string, filters: object, ctx: ServiceContext) => Promise<ReportPdfPayload>;
};

function exportsWithRealRenderer() {
  let document: ReactElement<Record<string, unknown>> | undefined;
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL("./report-pdf-export.service.tsx", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const dependencies: Record<string, unknown> = {
    "react/jsx-runtime": jsxRuntime,
    "@bloqer/services": { getMaterialVarianceReport: async () => material, getProjectCostControl: async () => report },
    "./branding/pdf-branding.service": { resolvePdfReportBranding: async () => branding },
    "./filename.service": { safeReportFilename },
    "./pdf/cost-control-pdf": { CostControlReportPdfDocument },
    "./pdf/project-simple-table-pdf": { ProjectSimpleTablePdfDocument },
    "./pdf/pdf-renderer.service": { renderReportPdfToBuffer: async (element: ReactElement<Record<string, unknown>>) => {
      document = element;
      return renderReportPdfToBuffer(element as ReactElement<DocumentProps>);
    } },
  };
  runInNewContext(code, { exports, require: (name: string) => dependencies[name] ?? {} });
  return { exporters: exports as Exporters, document: () => { assert.ok(document); return document; } };
}

function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === "object") return Object.values(value).flatMap(strings);
  return [];
}

test("material PDF exports valuation gaps, original currency and warnings through a real local render", async () => {
  const loaded = exportsWithRealRenderer();
  const result = await loaded.exporters.exportMaterialVariancePdf("project", {}, ctx);
  assert.equal(result.buffer.subarray(0, 5).toString("ascii"), "%PDF-");
  assert.ok(result.buffer.length > 1000);
  const props = loaded.document().props;
  assert.match(String(props.subtitle), /Moneda: USD/);
  assert.match(String(props.totalsLine), /Consumo: Sin valuación · Var\.: No calculable/);
  const rows = props.rows as Array<Record<string, string>>;
  assert.equal(rows[0]!.actual, "Sin valuación");
  assert.equal(rows[0]!.variance, "—");
  assert.equal(rows[1]!.actual, "0.00");
  assert.equal(rows[1]!.variance, "100.00");
  assert.deepEqual(Array.from(props.warnings as string[]), [warning]);
  assert.doesNotMatch(String(props.totalsLine), /null|NaN/);
});

test("cost PDF preserves unvalued consumption beside valid documentary totals and renders without external assets", async () => {
  const loaded = exportsWithRealRenderer();
  const result = await loaded.exporters.exportProjectCostControlPdf("project", {}, ctx);
  assert.equal(result.buffer.subarray(0, 5).toString("ascii"), "%PDF-");
  assert.ok(result.buffer.length > 1000);
  const tree = CostControlReportPdfDocument({ report, filters: {}, branding });
  const text = strings(tree).join(" ");
  assert.match(text, /Moneda:.*USD/);
  assert.match(text, /Consumo inventario:.*Sin valuación/);
  assert.match(text, /inv\. Sin valuación/);
  assert.match(text, /Exposición esperada:.*100\.00/);
  assert.ok(text.includes(warning));
  assert.doesNotMatch(text, /\bnull\b|NaN/);
});
