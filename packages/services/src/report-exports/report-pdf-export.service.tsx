import type { AgingFilters } from "../aging/aging.service";
import { getPayableAgingReport, getReceivableAgingReport } from "../aging/aging.service";
import type { CostControlFilters } from "../cost-control/cost-control.service";
import { getProjectCostControl } from "../cost-control/cost-control.service";
import { ServiceContext, ServiceError } from "../types";
import { safeReportFilename } from "./filename.service";
import { AgingReportPdfDocument } from "./pdf/aging-pdf";
import { CostControlReportPdfDocument } from "./pdf/cost-control-pdf";
import type { ReportPdfPayload } from "./pdf/pdf-export.types";
import { renderReportPdfToBuffer } from "./pdf/pdf-renderer.service";

export async function exportReceivableAgingPdf(
  filters: AgingFilters,
  ctx: ServiceContext,
): Promise<ReportPdfPayload> {
  const report = await getReceivableAgingReport(filters, ctx);
  const generatedAtIso = new Date().toISOString();
  const buffer = await renderReportPdfToBuffer(
    <AgingReportPdfDocument variant="AR" report={report} filters={filters} generatedAtIso={generatedAtIso} />,
  );
  return { buffer, filename: safeReportFilename(`aging_cxc_${report.asOfDate}`, "pdf") };
}

export async function exportPayableAgingPdf(
  filters: AgingFilters,
  ctx: ServiceContext,
): Promise<ReportPdfPayload> {
  const report = await getPayableAgingReport(filters, ctx);
  const generatedAtIso = new Date().toISOString();
  const buffer = await renderReportPdfToBuffer(
    <AgingReportPdfDocument variant="AP" report={report} filters={filters} generatedAtIso={generatedAtIso} />,
  );
  return { buffer, filename: safeReportFilename(`aging_cxp_${report.asOfDate}`, "pdf") };
}

export async function exportProjectCostControlPdf(
  projectId: string,
  filters: CostControlFilters,
  ctx: ServiceContext,
): Promise<ReportPdfPayload> {
  const result = await getProjectCostControl(projectId, filters, ctx);
  if (result.type === "NO_APPROVED_BUDGETS") {
    throw new ServiceError("CONFLICT", "No hay presupuesto aprobado o cerrado para exportar el control de costos");
  }
  if (result.type === "BUDGET_SELECTION_REQUIRED") {
    throw new ServiceError("CONFLICT", "Seleccioná un presupuesto para exportar el control de costos");
  }
  const generatedAtIso = new Date().toISOString();
  const buffer = await renderReportPdfToBuffer(
    <CostControlReportPdfDocument report={result} filters={filters} generatedAtIso={generatedAtIso} />,
  );
  const slug = `${result.budgetName}_${filters.dateFrom ?? "all"}_${filters.dateTo ?? "all"}`
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .slice(0, 80);
  return { buffer, filename: safeReportFilename(`control_costos_${slug}`, "pdf") };
}
