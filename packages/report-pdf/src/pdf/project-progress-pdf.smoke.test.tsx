import assert from "node:assert/strict";
import test from "node:test";
import { writeFile } from "node:fs/promises";
import { projectProgressExportFixture } from "./project-progress-pdf.fixture";
import type { PdfReportBranding } from "../branding/pdf-branding.types";
import { renderReportPdfToBuffer } from "./pdf-renderer.service";
import { ProjectProgressPdfDocument } from "./project-progress-pdf";

const branding: PdfReportBranding = {
  tenantName: "Constructora de prueba",
  companyDisplayName: "Constructora de prueba S.A.",
  projectLabel: "PR-01 · Obra de prueba",
  generatedByLabel: "Pruebas de exportación",
  generatedAtIso: "2026-10-28T15:00:00.000Z",
  logoDataUri: null,
};

test("executive progress PDF renders charts, table and pending evidence", async () => {
  const buffer = await renderReportPdfToBuffer(
    <ProjectProgressPdfDocument report={projectProgressExportFixture()} branding={branding} />,
  );
  assert.equal(buffer.subarray(0, 5).toString("ascii"), "%PDF-");
  assert.ok(buffer.length > 5000);
  if (process.env.BLOQER_PDF_REVIEW_OUTPUT)
    await writeFile(process.env.BLOQER_PDF_REVIEW_OUTPUT, buffer);
});

test("progress PDF renders missing/legacy measurements and restricted financial sections", async () => {
  const report = projectProgressExportFixture();
  report.physical.pct = null;
  report.physical.hasLegacy = true;
  report.physical.coveragePct = "60.0000";
  report.series[1]!.physicalPct = null;
  for (const key of Object.keys(report.financial) as (keyof typeof report.financial)[])
    report.financial[key] = null;
  for (const point of report.series) {
    point.certified = point.invoiced = point.collected = null;
    point.costAccrued = point.costExposure = point.costPaid = null;
  }
  report.warnings.push("Porcentaje anterior a junio de 2026: requiere revisión.");
  const buffer = await renderReportPdfToBuffer(
    <ProjectProgressPdfDocument report={report} branding={branding} />,
  );
  assert.equal(buffer.subarray(0, 5).toString("ascii"), "%PDF-");
  assert.ok(buffer.length > 5000);
});

test("progress PDF renders signed cost bars and comparable history with an unavailable final cut", async () => {
  const report = projectProgressExportFixture();
  report.financial.costAccrued = "-2000000.00";
  report.financial.costAccruedPct = "-20.0000";
  report.financial.costExposure = "0.00";
  report.financial.costExposurePct = "0.0000";
  report.financial.invoiced = report.financial.collected = null;
  report.financial.collectionPct = null;
  report.series.at(-1)!.invoiced = report.series.at(-1)!.collected = null;
  report.rows[0]!.budgetQty = null;
  const buffer = await renderReportPdfToBuffer(
    <ProjectProgressPdfDocument report={report} branding={branding} />,
  );
  assert.equal(buffer.subarray(0, 5).toString("ascii"), "%PDF-");
  assert.ok(buffer.length > 5000);
  if (process.env.BLOQER_PDF_AUDIT_OUTPUT)
    await writeFile(process.env.BLOQER_PDF_AUDIT_OUTPUT, buffer);
});
