import type { AgingFilters } from "../aging/aging.service";
import { getPayableAgingReport, getReceivableAgingReport } from "../aging/aging.service";
import type { CostControlFilters } from "../cost-control/cost-control.service";
import { getProjectCostControl } from "../cost-control/cost-control.service";
import {
  getBudgetVarianceReport,
  type BudgetVarianceFilters,
} from "../reports/budget-variance.service";
import { parseBudgetVarianceFilters } from "./report-export.service";
import {
  getCertificationEvolutionReport,
  type CertificationReportFilters,
} from "../reports/certification-evolution.service";
import { parseCertificationReportFilters } from "./report-export.service";
import {
  getProjectIncomeExpenseReport,
  type IncomeExpenseFilters,
} from "../reports/project-income-expense.service";
import {
  getProjectProfitabilityReport,
  type ProfitabilityFilters,
} from "../reports/project-profitability.service";
import { getSubcontractVarianceReport, type SubcontractReportFilters } from "../reports/subcontract-variance.service";
import { parseSubcontractReportFilters } from "./report-export.service";
import { ServiceContext, ServiceError } from "../types";
import { safeReportFilename } from "./filename.service";
import { AgingReportPdfDocument } from "./pdf/aging-pdf";
import { CostControlReportPdfDocument } from "./pdf/cost-control-pdf";
import { ProjectSimpleTablePdfDocument } from "./pdf/project-simple-table-pdf";
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

function filterLineParts(filters: Record<string, string | undefined>): string {
  return Object.entries(filters)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${v}`)
    .join(" · ");
}

export async function exportBudgetVariancePdf(
  projectId: string,
  filters: BudgetVarianceFilters,
  ctx: ServiceContext,
): Promise<ReportPdfPayload> {
  const raw = await getBudgetVarianceReport(projectId, filters, ctx);
  if (raw.type === "NO_APPROVED_BUDGETS" || raw.type === "BUDGET_SELECTION_REQUIRED") {
    throw new ServiceError("CONFLICT", "No hay presupuesto aprobado para exportar");
  }
  const report = raw;
  const generatedAtIso = new Date().toISOString();
  const buffer = await renderReportPdfToBuffer(
    <ProjectSimpleTablePdfDocument
      title="Presupuesto vs real"
      subtitle={`${report.budgetName}`}
      filterLine={filterLineParts({ budgetId: filters.budgetId, costLayer: filters.costLayer })}
      generatedAtIso={generatedAtIso}
      totalsLine={`Venta presup.: ${report.totals.budgetTotalSale} · Costo real (${report.costLayer}): ${report.totals.actualCost}`}
      warnings={report.warnings}
      columns={[
        { key: "code", label: "Partida", flex: 0.8 },
        { key: "name", label: "Ítem", flex: 1.4 },
        { key: "budget", label: "Presup.", flex: 0.9 },
        { key: "actual", label: "Real", flex: 0.9 },
        { key: "variance", label: "Var.", flex: 0.8 },
      ]}
      rows={report.rows.map((r) => ({
        code: r.wbsCode,
        name: r.wbsName,
        budget: r.budgetTotalCost,
        actual: r.actualCost,
        variance: r.costVariance,
      }))}
    />,
  );
  return { buffer, filename: safeReportFilename(`presupuesto_vs_real_${report.budgetName}`, "pdf") };
}

export async function exportCertificationEvolutionPdf(
  projectId: string,
  filters: CertificationReportFilters,
  ctx: ServiceContext,
): Promise<ReportPdfPayload> {
  const report = await getCertificationEvolutionReport(projectId, filters, ctx);
  if (report.type === "NO_APPROVED_BUDGETS") {
    throw new ServiceError("CONFLICT", "No hay presupuesto aprobado para exportar");
  }
  const generatedAtIso = new Date().toISOString();
  const buffer = await renderReportPdfToBuffer(
    <ProjectSimpleTablePdfDocument
      title="Certificaciones — evolución"
      subtitle={report.budgetName}
      filterLine={filterLineParts({ dateFrom: filters.dateFrom, dateTo: filters.dateTo })}
      generatedAtIso={generatedAtIso}
      columns={[
        { key: "period", label: "Período", flex: 1 },
        { key: "cert", label: "Certificado", flex: 1 },
        { key: "inv", label: "Facturado", flex: 1 },
        { key: "col", label: "Cobrado", flex: 1 },
      ]}
      rows={report.monthlySeries.map((p) => ({
        period: p.periodLabel,
        cert: p.certifiedAmount,
        inv: p.invoicedAmount,
        col: p.collectedAmount,
      }))}
      warnings={report.warnings}
    />,
  );
  return { buffer, filename: safeReportFilename(`certificaciones_${report.budgetName}`, "pdf") };
}

export async function exportSubcontractVariancePdf(
  projectId: string,
  filters: SubcontractReportFilters,
  ctx: ServiceContext,
): Promise<ReportPdfPayload> {
  const report = await getSubcontractVarianceReport(projectId, filters, ctx);
  if (report.type === "NO_APPROVED_BUDGETS") {
    throw new ServiceError("CONFLICT", "No hay presupuesto aprobado para exportar");
  }
  const generatedAtIso = new Date().toISOString();
  const buffer = await renderReportPdfToBuffer(
    <ProjectSimpleTablePdfDocument
      title="Subcontratos — varianza"
      subtitle={`${report.budgetName} · ${report.pendingContractCount} sin contrato`}
      filterLine={filterLineParts({ dateFrom: filters.dateFrom, dateTo: filters.dateTo })}
      generatedAtIso={generatedAtIso}
      columns={[
        { key: "code", label: "Partida", flex: 0.7 },
        { key: "name", label: "Ítem", flex: 1.2 },
        { key: "budget", label: "Presup. sub", flex: 0.9 },
        { key: "committed", label: "Contratado", flex: 0.9 },
        { key: "status", label: "Estado", flex: 0.8 },
      ]}
      rows={report.byWbs.map((r) => ({
        code: r.wbsCode,
        name: r.wbsName,
        budget: r.budgetSubcontract,
        committed: r.committedCost,
        status: r.status,
      }))}
      warnings={report.warnings}
    />,
  );
  return { buffer, filename: safeReportFilename(`subcontratos_${report.budgetName}`, "pdf") };
}

export async function exportProjectIncomeExpensePdf(
  projectId: string,
  filters: IncomeExpenseFilters,
  ctx: ServiceContext,
): Promise<ReportPdfPayload> {
  const report = await getProjectIncomeExpenseReport(projectId, filters, ctx);
  const generatedAtIso = new Date().toISOString();
  const buffer = await renderReportPdfToBuffer(
    <ProjectSimpleTablePdfDocument
      title="Ingresos vs gastos"
      subtitle={`${report.dateFrom} → ${report.dateTo} · ${report.displayCurrency}`}
      generatedAtIso={generatedAtIso}
      totalsLine={`MB devengado: ${report.totals.grossMarginAccrued} · MB caja: ${report.totals.grossMarginCash}`}
      columns={[
        { key: "period", label: "Mes", flex: 1 },
        { key: "cert", label: "Certificado", flex: 0.9 },
        { key: "costAcc", label: "Costo dev.", flex: 0.9 },
        { key: "mb", label: "MB dev.", flex: 0.9 },
      ]}
      rows={report.series.map((p) => ({
        period: p.periodLabel,
        cert: p.certifiedAmount,
        costAcc: p.costAccrued,
        mb: p.grossMarginAccrued,
      }))}
      warnings={report.warnings}
    />,
  );
  return {
    buffer,
    filename: safeReportFilename(`ingresos_gastos_${report.dateFrom}_${report.dateTo}`, "pdf"),
  };
}

export async function exportProjectProfitabilityPdf(
  projectId: string,
  filters: ProfitabilityFilters,
  ctx: ServiceContext,
): Promise<ReportPdfPayload> {
  const report = await getProjectProfitabilityReport(projectId, filters, ctx);
  if (report.type === "NO_APPROVED_BUDGETS") {
    throw new ServiceError("CONFLICT", "No hay presupuesto aprobado para exportar");
  }
  const generatedAtIso = new Date().toISOString();
  const buffer = await renderReportPdfToBuffer(
    <ProjectSimpleTablePdfDocument
      title="Rentabilidad del proyecto"
      subtitle={`${report.budgetName} · ${report.currency}`}
      generatedAtIso={generatedAtIso}
      totalsLine={`Ingresos: ${report.revenue} · Costos: ${report.directCost} · MB: ${report.grossMargin} (${report.grossMarginPct ?? "—"}%)`}
      columns={[
        { key: "metric", label: "Concepto", flex: 1.2 },
        { key: "value", label: "Monto", flex: 1 },
      ]}
      rows={[
        { metric: "Ingresos", value: report.revenue },
        { metric: "Costos directos", value: report.directCost },
        { metric: "Margen bruto", value: report.grossMargin },
        { metric: "Margen proyectado", value: report.projectedMargin },
      ]}
      warnings={report.warnings}
    />,
  );
  return { buffer, filename: safeReportFilename(`rentabilidad_${report.budgetName}`, "pdf") };
}

