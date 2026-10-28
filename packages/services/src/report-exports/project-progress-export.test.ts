import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import { sendReportByEmailInputSchema, projectScheduledReportKeySchema } from "@bloqer/validators";
import { buildProjectProgressExportSheets } from "./project-progress-export-pure";
import { projectProgressExportFixture } from "./project-progress-export.fixture";
import { buildXlsxWorkbook } from "./xlsx-export.service";

test("progress workbook preserves exact money, opening balances and reporting bases", () => {
  const sheets = buildProjectProgressExportSheets(projectProgressExportFixture());
  assert.equal(sheets.length, 5);
  assert.ok(
    sheets[0]!.rows.some(
      (r) => r[0] === "Certificado anterior al período" && r[1] === "1000000.00",
    ),
  );
  assert.ok(sheets[0]!.rows.some((r) => r[0] === "Cobrado sobre facturado" && r[1] === "66.1157"));
  assert.equal(sheets[1]!.rows[0]![9], "50.0000");
  const wb = XLSX.read(buildXlsxWorkbook(sheets), { type: "buffer" });
  assert.deepEqual(wb.SheetNames, [
    "Resumen",
    "Partidas",
    "Evolución",
    "Pendientes",
    "Criterios y avisos",
  ]);
  assert.ok(wb.Sheets.Resumen);
});

test("unavailable sections omit confidential columns and absent measurements stay blank", () => {
  const report = projectProgressExportFixture();
  for (const key of Object.keys(report.financial) as (keyof typeof report.financial)[])
    report.financial[key] = null;
  report.physical.pct = null;
  report.physical.observedPct = null;
  report.rows[0]!.physicalPct = null;
  report.sectionsExcluded = ["Costos: sin permisos"];
  // Deliberately retain row amounts to verify column filtering is based on the authorized section.
  const sheets = buildProjectProgressExportSheets(report);
  assert.ok(!sheets[1]!.headers.includes("Devengado"));
  assert.ok(!sheets[1]!.headers.includes("Cantidad certificada"));
  assert.ok(!sheets[0]!.rows.some((r) => r[0] === "Venta presupuestada"));
  assert.equal(sheets[1]!.rows[0]![5], "");
  assert.ok(sheets[4]!.rows.some((r) => r[1] === "Costos: sin permisos"));
});

test("progress report is registered for scheduling and manual attachments require a project", () => {
  assert.equal(projectScheduledReportKeySchema.parse("PROJECT_PROGRESS"), "PROJECT_PROGRESS");
  const input = {
    reportType: "PROJECT_PROGRESS",
    format: "pdf",
    recipientEmail: "reports@example.com",
  };
  assert.equal(sendReportByEmailInputSchema.safeParse(input).success, false);
  assert.equal(
    sendReportByEmailInputSchema.safeParse({
      ...input,
      projectId: "11111111-1111-4111-8111-111111111111",
    }).success,
    true,
  );
});

test("known actual costs remain exportable when a budget base is incomplete", () => {
  const report = projectProgressExportFixture();
  report.financial.budgetCost = null;
  report.financial.costAccruedPct = null;
  const sheets = buildProjectProgressExportSheets(report);
  assert.ok(sheets[1]!.headers.includes("Devengado"));
  assert.ok(sheets[0]!.rows.some(r => r[0] === "Costo devengado" && r[1] === "5500000.00"));
  assert.ok(!sheets[0]!.rows.some(r => r[0] === "Costo presupuestado"));
});
