import type { ReactElement } from "react";
import type { DocumentProps } from "@react-pdf/renderer";
import { AUDIT_UI_MODULE_LABEL_ES } from "@bloqer/domain";
import {
  fetchTenantAuditLogForExport,
  formatAuditLogExportFilterLine,
  getAccountLedgerReport,
  getAccountMovementReport,
  getBudgetVarianceReport,
  getCashFlowReport,
  getCashPositionReport,
  getCertificationEvolutionReport,
  getIncomeStatement,
  getMaterialVarianceReport,
  getPayableAgingReport,
  getProcurementDeviationReport,
  getPurchaseOrderVarianceReport,
  getProjectSupplierReport,
  getProjectProgressReport,
  type ProjectProgressFilters,
  getProjectCashFlowReport,
  getProjectCostControl,
  sliceCostControlReportByCostType,
  getProjectIncomeExpenseReport,
  getProjectProfitabilityReport,
  getReceivableAgingReport,
  getStatementOfFinancialPosition,
  getStockBalanceReport,
  getStockMovementReport,
  getSubcontractVarianceReport,
  getTrialBalanceReport,
  listCompanyPayables,
  readCompanySupplierInvoicesForExport,
  listPostedJournalBookForExport,
  MAX_ACCOUNT_LEDGER_ROWS,
  MAX_EXPORT_ROWS,
  ServiceError,
  type AccountingReportDateRange,
  type AgingFilters,
  type BudgetVarianceFilters,
  type BudgetWbsExportFilters,
  budgetWbsExportPdfColumns,
  budgetWbsExportPdfRowsFromTable,
  buildBudgetWbsExportPayload,
  buildScheduleExportPayload,
  type ScheduleExportFilters,
  buildJobsiteLogPdfPayload,
  type CashFlowFilters,
  type CashPositionFilters,
  type CertificationReportFilters,
  type CompanyPayableListFilters,
  type CompanySupplierInvoiceListFilters,
  type CostControlFilters,
  type IncomeExpenseFilters,
  type ListTenantAuditLogFilters,
  type MaterialReportFilters,
  type MovementExportLabels,
  type MovementReportFilters,
  type ProcurementReportFilters,
  type ProjectSupplierReportFilters,
  TREASURY_MOVEMENTS_EXPORT_LABELS,
  type ProfitabilityFilters,
  type ProjectCashFlowFilters,
  type ServiceContext,
  type StockBalanceFilters,
  type StockMovementReportFilters,
  type SubcontractReportFilters,
  type TenantAuditLogExportUrlFilters,
  getTenantDisplayTimezone,
  getProjectPortfolioReport,
  getPortfolioProfitabilityReport,
  getOverheadByProjectReport,
  getMultiProjectProcurementReport,
  parsePortfolioProfitabilityExportFilters,
  parsePortfolioReportStatus,
} from "@bloqer/services";
import { formatDateTime, formatDbDate, formatTimezoneOptionLabel } from "@bloqer/utils";
import { resolvePdfReportBranding } from "./branding/pdf-branding.service";
import type { PdfReportBranding } from "./branding/pdf-branding.types";
import { safeReportFilename } from "./filename.service";
import { AgingReportPdfDocument } from "./pdf/aging-pdf";
import { CostControlReportPdfDocument } from "./pdf/cost-control-pdf";
import { JobsiteLogPdfDocument } from "./pdf/jobsite-log-pdf";
import { ProjectSimpleTablePdfDocument } from "./pdf/project-simple-table-pdf";
import { ProjectProgressPdfDocument } from "./pdf/project-progress-pdf";
import { SchedulePdfDocument } from "./pdf/schedule-pdf";
import type { ReportPdfPayload } from "./pdf/pdf-export.types";
import { MAX_AUDIT_LOG_PDF_ROWS, MAX_PROJECT_REPORT_PDF_ROWS } from "./pdf/pdf-export.types";
import { renderReportPdfToBuffer } from "./pdf/pdf-renderer.service";
import { buildPdfFilterLine } from "./pdf/pdf-filter-line";

type BrandingScope = { projectId?: string };

const PORTFOLIO_COST_LAYER_LABELS = {
  exposure: "Exposición esperada",
  committed: "Costo comprometido",
  accrued: "Costo devengado",
  paid: "Costo pagado",
};

async function exportPdfDocument(
  ctx: ServiceContext,
  scope: BrandingScope,
  filenameBase: string,
  buildDocument: (branding: PdfReportBranding) => ReactElement<DocumentProps>,
): Promise<ReportPdfPayload> {
  const branding = await resolvePdfReportBranding(ctx, scope);
  const buffer = await renderReportPdfToBuffer(buildDocument(branding));
  return { buffer, filename: safeReportFilename(filenameBase, "pdf") };
}

export async function exportReceivableAgingPdf(
  filters: AgingFilters,
  ctx: ServiceContext,
): Promise<ReportPdfPayload> {
  const report = await getReceivableAgingReport(filters, ctx);
  return exportPdfDocument(
    ctx,
    { projectId: filters.projectId },
    `aging_cxc_${report.asOfDate}`,
    (branding) => (
      <AgingReportPdfDocument variant="AR" report={report} filters={filters} branding={branding} />
    ),
  );
}

export async function exportPayableAgingPdf(
  filters: AgingFilters,
  ctx: ServiceContext,
): Promise<ReportPdfPayload> {
  const report = await getPayableAgingReport(filters, ctx);
  return exportPdfDocument(
    ctx,
    { projectId: filters.projectId },
    `aging_cxp_${report.asOfDate}`,
    (branding) => (
      <AgingReportPdfDocument variant="AP" report={report} filters={filters} branding={branding} />
    ),
  );
}

export async function exportProjectCostControlPdf(
  projectId: string,
  filters: CostControlFilters,
  ctx: ServiceContext,
): Promise<ReportPdfPayload> {
  const raw = await getProjectCostControl(projectId, filters, ctx);
  if (raw.type === "NO_APPROVED_BUDGETS") {
    throw new ServiceError(
      "CONFLICT",
      "No hay presupuesto aprobado o cerrado para exportar el control de costos",
    );
  }
  if (raw.type === "BUDGET_SELECTION_REQUIRED") {
    throw new ServiceError(
      "CONFLICT",
      "Seleccioná un presupuesto para exportar el control de costos",
    );
  }
  const result = filters.costType ? sliceCostControlReportByCostType(raw, filters.costType) : raw;
  const typeSuffix = filters.costType ? `_${filters.costType.toLowerCase()}` : "";
  const slug =
    `${result.budgetName}_${filters.dateFrom ?? "all"}_${filters.dateTo ?? "all"}${typeSuffix}`
      .replace(/[^a-zA-Z0-9._-]+/g, "_")
      .slice(0, 80);
  return exportPdfDocument(ctx, { projectId }, `control_costos_${slug}`, (branding) => (
    <CostControlReportPdfDocument report={result} filters={filters} branding={branding} />
  ));
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
  return exportPdfDocument(
    ctx,
    { projectId },
    `presupuesto_vs_real_${report.budgetName}`,
    (branding) => (
      <ProjectSimpleTablePdfDocument
        branding={branding}
        title="Presupuesto vs real"
        subtitle={`${report.budgetName}`}
        filterLine={buildPdfFilterLine({
          budgetId: filters.budgetId,
          costLayer: filters.costLayer,
        })}
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
      />
    ),
  );
}

export async function exportBudgetWbsPdf(
  budgetId: string,
  projectId: string,
  filters: BudgetWbsExportFilters,
  ctx: ServiceContext,
): Promise<ReportPdfPayload> {
  const payload = await buildBudgetWbsExportPayload(budgetId, projectId, filters, ctx);
  const rows = budgetWbsExportPdfRowsFromTable(filters, payload.rows);
  const slug = `${payload.meta.budgetName}_v${payload.meta.versionNumber}_${payload.meta.viewLabel}`
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .slice(0, 80);
  return exportPdfDocument(ctx, { projectId }, `presupuesto_edt_${slug}`, (branding) => (
    <ProjectSimpleTablePdfDocument
      branding={branding}
      title="Presupuesto — EDT"
      subtitle={`${payload.meta.budgetName} · v${payload.meta.versionNumber}`}
      filterLine={`Moneda: ${payload.meta.currency} · Vista: ${payload.meta.viewLabel}`}
      totalsLine={`Costo directo: ${payload.meta.totalCostDirect} · Total venta: ${payload.meta.totalSalePrice}`}
      columns={budgetWbsExportPdfColumns(filters)}
      rows={rows}
    />
  ));
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
  const progressByPeriod = new Map(report.progressSeries.map((point) => [point.periodKey, point]));
  return exportPdfDocument(
    ctx,
    { projectId },
    `certificaciones_${report.budgetName}`,
    (branding) => (
      <ProjectSimpleTablePdfDocument
        branding={branding}
        title="Certificaciones — evolución y estado"
        subtitle={`${report.budgetName} · ${report.currency}`}
        filterLine={buildPdfFilterLine({ dateFrom: filters.dateFrom, dateTo: filters.dateTo })}
        columns={[
          { key: "period", label: "Período", flex: 1 },
          { key: "cert", label: "Certificado", flex: 1 },
          { key: "inv", label: "Facturado", flex: 1 },
          { key: "col", label: "Cobrado", flex: 1 },
          { key: "economic", label: "Av. económico %", flex: 0.9 },
          { key: "physical", label: "Av. físico %", flex: 0.9 },
          { key: "financial", label: "Av. financiero %", flex: 0.9 },
        ]}
        rows={report.monthlySeries.map((p) => ({
          period: p.periodLabel,
          cert: p.certifiedAmount,
          inv: p.invoicedAmount ?? "—",
          col: p.collectedAmount ?? "—",
          economic: progressByPeriod.get(p.periodKey)?.economicPct ?? "—",
          physical: progressByPeriod.get(p.periodKey)?.physicalPct ?? "—",
          financial: progressByPeriod.get(p.periodKey)?.financialPct ?? "—",
        }))}
        warnings={report.warnings}
        additionalTable={report.portfolio.length > 0 ? {
          title: "Estado de las certificaciones",
          columns: [
            { key: "code", label: "Código", flex: 0.6 },
            { key: "period", label: "Período", flex: 1.2 },
            { key: "status", label: "Estado", flex: 0.7 },
            { key: "certified", label: "Certificado", flex: 0.8 },
            { key: "invoiced", label: "Facturado", flex: 0.8 },
            { key: "collected", label: "Cobrado", flex: 0.8 },
            { key: "payment", label: "Cobranza", flex: 0.8 },
          ],
          rows: report.portfolio.map((row) => ({
            code: row.code,
            period: `${row.periodStart} → ${row.periodEnd}`,
            status: row.status,
            certified: row.totalAmount,
            invoiced: row.invoicedAmount ?? "—",
            collected: row.collectedAmount ?? "—",
            payment: row.paymentStatus ?? "—",
          })),
        } : undefined}
      />
    ),
  );
}

export async function exportProjectProgressPdf(
  projectId: string,
  filters: ProjectProgressFilters,
  ctx: ServiceContext,
): Promise<ReportPdfPayload> {
  const report = await getProjectProgressReport(projectId, filters, ctx);
  if (report.type !== "REPORT") {
    throw new ServiceError(
      "CONFLICT",
      "No hay presupuesto aprobado o cerrado para exportar avances",
    );
  }
  return exportPdfDocument(ctx, { projectId }, `avance_proyecto_${report.dateTo}`, (branding) => (
    <ProjectProgressPdfDocument report={report} branding={branding} />
  ));
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
  return exportPdfDocument(ctx, { projectId }, `subcontratos_${report.budgetName}`, (branding) => (
    <ProjectSimpleTablePdfDocument
      branding={branding}
      title="Subcontratos — varianza y certificaciones"
      subtitle={`${report.budgetName} · ${report.currency} · ${report.pendingContractCount} sin contrato`}
      filterLine={buildPdfFilterLine({ dateFrom: filters.dateFrom, dateTo: filters.dateTo })}
      columns={[
        { key: "code", label: "Código", flex: 0.7 },
        { key: "name", label: "Ítem", flex: 1.2 },
        { key: "budget", label: "Presup. sub", flex: 0.9 },
        { key: "committed", label: "Contratado", flex: 0.9 },
        { key: "certified", label: "Certificado", flex: 0.9 },
        { key: "paid", label: "Pagado", flex: 0.75 },
        { key: "variance", label: "Variación", flex: 0.8 },
        { key: "status", label: "Estado", flex: 0.8 },
      ]}
      rows={[
        ...report.byWbs.map((r) => ({
          code: r.wbsCode,
          name: r.wbsName,
          budget: r.budgetSubcontract,
          committed: r.committedCost,
          certified: r.certifiedCost,
          paid: "—",
          variance: r.varianceCommitted,
          status: r.status,
        })),
        ...report.contracts.map((contract) => ({
          code: contract.code,
          name: `${contract.title} · ${contract.subcontractorName}`,
          budget: "—",
          committed: contract.totalValue,
          certified: contract.certifiedCost,
          paid: "—",
          variance: "—",
          status: contract.status,
        })),
        ...report.monthlyCertification.map((point) => ({
          code: point.periodKey,
          name: point.periodLabel,
          budget: "—",
          committed: "—",
          certified: point.certifiedAmount,
          paid: report.apAvailable ? point.paidAmount : "—",
          variance: "—",
          status: "—",
        })),
      ]}
      warnings={report.warnings}
    />
  ));
}

export async function exportProjectIncomeExpensePdf(
  projectId: string,
  filters: IncomeExpenseFilters,
  ctx: ServiceContext,
): Promise<ReportPdfPayload> {
  const report = await getProjectIncomeExpenseReport(projectId, filters, ctx);
  const { certifications, ar, ap } = report.sourcesAvailable;
  return exportPdfDocument(
    ctx,
    { projectId },
    `ingresos_gastos_${report.dateFrom}_${report.dateTo}`,
    (branding) => (
      <ProjectSimpleTablePdfDocument
        branding={branding}
        title="Ingresos vs gastos"
        subtitle={`${report.dateFrom} → ${report.dateTo}`}
        columns={[
          { key: "currency", label: "Moneda", flex: 0.55 },
          { key: "period", label: "Mes", flex: 1 },
          { key: "cert", label: "Certificado", flex: 0.9 },
          { key: "costAcc", label: "Costo dev.", flex: 0.9 },
          { key: "mb", label: "MB dev.", flex: 0.9 },
          { key: "collected", label: "Cobrado", flex: 0.9 },
          { key: "paid", label: "Pagado", flex: 0.9 },
          { key: "mbCash", label: "MB caja", flex: 0.9 },
        ]}
        rows={report.byCurrency.flatMap(({ currency, series, totals }) =>
          [{ ...totals, periodLabel: "Total" }, ...series].map((p) => ({
            currency,
            period: p.periodLabel,
            cert: certifications ? p.certifiedAmount : "—",
            costAcc: ap ? p.costAccrued : "—",
            mb: p.grossMarginAccrued ?? "—",
            collected: ar ? p.collectedAmount : "—",
            paid: ap ? p.costPaid : "—",
            mbCash: p.grossMarginCash ?? "—",
          })),
        )}
        warnings={report.warnings}
      />
    ),
  );
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
  const revenueLabel = report.revenueBasis === "invoiced" ? "Facturado neto" : "Certificado";
  const overheadCurrency = report.overheadManualAmount != null ? report.currency : "ARS";
  return exportPdfDocument(ctx, { projectId }, `rentabilidad_${report.budgetName}`, (branding) => (
    <ProjectSimpleTablePdfDocument
      branding={branding}
      title="Rentabilidad del proyecto"
      subtitle={`${report.budgetName} · ${revenueLabel} · ${PORTFOLIO_COST_LAYER_LABELS[report.costLayer]}`}
      columns={[
        { key: "metric", label: "Concepto", flex: 1.2 },
        { key: "value", label: "Monto", flex: 1 },
        { key: "currency", label: "Moneda", flex: 0.5 },
      ]}
      rows={[
        { metric: revenueLabel, value: report.revenue ?? "—", currency: report.currency },
        { metric: "Costos directos", value: report.directCost ?? "—", currency: report.currency },
        { metric: "Margen bruto", value: report.grossMargin ?? "—", currency: report.currency },
        { metric: "Margen bruto %", value: report.grossMarginPct == null ? "—" : `${report.grossMarginPct}%`, currency: "" },
        { metric: "Margen proyectado", value: report.projectedMargin, currency: report.budgetCurrency },
        { metric: "Venta presupuestada", value: report.budgetTotalSale, currency: report.budgetCurrency },
        ...(report.overheadAmount != null ? [
          { metric: "Gastos generales", value: report.overheadAmount, currency: overheadCurrency },
          { metric: "Margen neto", value: report.netMargin ?? "—", currency: report.currency },
        ] : []),
        ...report.byCurrency.flatMap((slice) => report.byCurrency.length > 1 ? [
          { metric: `${revenueLabel} por moneda`, value: slice.revenue, currency: slice.currency },
          { metric: "Costos directos por moneda", value: slice.directCost ?? "—", currency: slice.currency },
          { metric: "Margen bruto por moneda", value: slice.grossMargin ?? "—", currency: slice.currency },
        ] : []),
      ]}
      warnings={report.warnings}
    />
  ));
}

export async function exportTenantAuditLogPdf(
  filters: Omit<ListTenantAuditLogFilters, "cursor" | "limit">,
  ctx: ServiceContext,
  urlFilters?: TenantAuditLogExportUrlFilters,
): Promise<ReportPdfPayload> {
  const [{ rows, truncated }, timeZone] = await Promise.all([
    fetchTenantAuditLogForExport(filters, ctx, MAX_AUDIT_LOG_PDF_ROWS),
    getTenantDisplayTimezone(ctx),
  ]);

  const pdfRows = rows.map((r) => ({
    createdAt: formatDateTime(r.createdAt, { timeZone }),
    actor: r.actorLabel,
    module: r.module ? AUDIT_UI_MODULE_LABEL_ES[r.module] : "—",
    action: r.actionLabel,
    reference: r.reference ?? "—",
    project: r.projectName ?? "—",
  }));

  const filterLine = formatAuditLogExportFilterLine(urlFilters ?? {});
  const warnings: string[] = [];
  if (truncated) {
    warnings.push(
      `Detalle truncado: se muestran ${MAX_AUDIT_LOG_PDF_ROWS} filas. Exportá CSV para el detalle completo (hasta 10.000 filas con diff JSON).`,
    );
  }

  const dateStamp = new Date().toISOString().slice(0, 10);
  const base = truncated
    ? `registro_actividad_${dateStamp}_truncado_${MAX_AUDIT_LOG_PDF_ROWS}`
    : `registro_actividad_${dateStamp}`;

  return exportPdfDocument(ctx, {}, base, (branding) => (
    <ProjectSimpleTablePdfDocument
      branding={branding}
      title="Registro de actividad"
      subtitle={`Trazabilidad de acciones críticas · ${formatTimezoneOptionLabel(timeZone)}`}
      filterLine={filterLine}
      maxRows={MAX_AUDIT_LOG_PDF_ROWS}
      columns={[
        { key: "createdAt", label: "Fecha", flex: 1.15 },
        { key: "actor", label: "Usuario", flex: 1.2 },
        { key: "module", label: "Módulo", flex: 0.9 },
        { key: "action", label: "Acción", flex: 1.35 },
        { key: "reference", label: "Ref.", flex: 0.55 },
        { key: "project", label: "Proyecto", flex: 1.1 },
      ]}
      rows={pdfRows}
      warnings={warnings}
    />
  ));
}

export async function exportMaterialVariancePdf(
  projectId: string,
  filters: MaterialReportFilters,
  ctx: ServiceContext,
): Promise<ReportPdfPayload> {
  const result = await getMaterialVarianceReport(projectId, filters, ctx);
  if (result.type === "NO_APPROVED_BUDGETS") {
    throw new ServiceError("CONFLICT", "No hay presupuesto aprobado para exportar materiales");
  }
  return exportPdfDocument(ctx, { projectId }, `materiales_${result.budgetName}`, (branding) => (
    <ProjectSimpleTablePdfDocument
      branding={branding}
      title="Materiales del proyecto"
      subtitle={`${result.budgetName} · Moneda: ${result.currency}`}
      totalsLine={`Presupuesto: ${result.totals.budgetMaterial} · Consumo: ${result.totals.consumedCost ?? "Sin valuación"} · Var.: ${result.totals.variance ?? "No calculable"}`}
      columns={[
        { key: "code", label: "Partida", flex: 0.8 },
        { key: "name", label: "Ítem", flex: 1.4 },
        { key: "budget", label: "Presup.", flex: 0.9 },
        { key: "actual", label: "Consumo", flex: 0.9 },
        { key: "variance", label: "Var.", flex: 0.8 },
      ]}
      rows={result.byWbs.map((r) => ({
        code: r.wbsCode,
        name: r.wbsName,
        budget: r.budgetMaterial,
        actual: r.consumedCost ?? "Sin valuación",
        variance: r.variance ?? "—",
      }))}
      warnings={result.warnings}
    />
  ));
}

export async function exportProcurementDeviationPdf(
  projectId: string,
  filters: ProcurementReportFilters,
  ctx: ServiceContext,
): Promise<ReportPdfPayload> {
  const result = await getProcurementDeviationReport(projectId, filters, ctx);
  if (result.type === "NO_APPROVED_BUDGETS") {
    throw new ServiceError("CONFLICT", "No hay presupuesto aprobado para exportar compras");
  }
  const poVariance = await getPurchaseOrderVarianceReport(projectId, ctx, filters);
  return exportPdfDocument(ctx, { projectId }, `compras_${result.budgetName}`, (branding) => (
    <ProjectSimpleTablePdfDocument
      branding={branding}
      title="Análisis de compras"
      subtitle={`${result.budgetName} · ${result.currency}`}
      filterLine={buildPdfFilterLine({ dateFrom: filters.dateFrom, dateTo: filters.dateTo })}
      columns={[
        { key: "type", label: "Tipo", flex: 0.65 },
        { key: "code", label: "Código", flex: 0.7 },
        { key: "name", label: "Descripción o proveedor", flex: 1.45 },
        { key: "budget", label: "Presup.", flex: 0.85 },
        { key: "committed", label: "Comprom.", flex: 0.85 },
        { key: "accrued", label: "Deveng.", flex: 0.85 },
        { key: "variance", label: "Var.", flex: 0.75 },
        { key: "paid", label: "Pagado", flex: 0.75 },
        { key: "open", label: "OC abierta", flex: 0.8 },
        { key: "unallocated", label: "Sin EDT", flex: 0.8 },
      ]}
      rows={[
        ...result.bySupplier.map((row) => ({
          type: "Proveedor", code: "", name: row.supplierName,
          budget: "", committed: row.committedCost,
          accrued: result.apAvailable ? row.accruedCost : "—",
          variance: "", paid: result.apAvailable ? row.paidCost : "—",
          open: result.apAvailable ? row.openCommitted : "—", unallocated: "",
        })),
        ...result.unallocated.map((row) => ({
          type: row.documentType, code: row.documentCode,
          name: `${row.description} · ${row.supplierName}`,
          budget: "", committed: "", accrued: "", variance: "", paid: "", open: "",
          unallocated: row.amount,
        })),
        ...result.byWbs.map((row) => ({
          type: "Partida", code: row.wbsCode, name: row.wbsName,
          budget: row.budgetMaterial, committed: row.committedCost,
          accrued: result.apAvailable ? row.accruedCost : "—",
          variance: row.varianceAmount,
          paid: "", open: "", unallocated: "",
        })),
      ]}
      warnings={result.warnings}
      additionalTable={poVariance.rows.length > 0 ? {
        title: "Desvíos en líneas de OC",
        columns: [
          { key: "order", label: "OC", flex: 0.6 },
          { key: "description", label: "Línea / EDT", flex: 1.3 },
          { key: "currency", label: "Moneda OC", flex: 0.6 },
          { key: "price", label: "P. unitario", flex: 0.7 },
          { key: "discount", label: "Desc. %", flex: 0.65 },
          { key: "baseline", label: "Referencia", flex: 0.75 },
          { key: "variance", label: "Desvío %", flex: 0.7 },
          { key: "reason", label: "Motivo", flex: 1.5 },
        ],
        rows: poVariance.rows.map((row) => ({
          order: row.purchaseOrderCode,
          description: row.wbsCode ? `${row.description} · ${row.wbsCode}` : row.description,
          currency: row.currency,
          price: row.unitPrice,
          discount: row.discountPct,
          baseline: row.budgetUnitCostSnapshot ?? "—",
          variance: row.variancePct ?? "—",
          reason: row.varianceJustification ?? row.varianceTier,
        })),
      } : undefined}
    />
  ));
}

export async function exportProjectSupplierReportPdf(
  projectId: string,
  filters: ProjectSupplierReportFilters,
  ctx: ServiceContext,
): Promise<ReportPdfPayload> {
  const result = await getProjectSupplierReport(projectId, filters, ctx);
  const slug = projectId.replace(/[^a-zA-Z0-9._-]+/g, "_");
  return exportPdfDocument(ctx, { projectId }, `proveedores_${slug}`, (branding) => (
    <ProjectSimpleTablePdfDocument
      branding={branding}
      title="Proveedores de la obra"
      subtitle={`Pedidos, capas de costo y saldo CxP (R-AP-03) · ${result.currency}`}
      filterLine={buildPdfFilterLine({ dateFrom: filters.dateFrom, dateTo: filters.dateTo, currency: result.currency })}
      totalsLine={`Proveedores: ${result.totals.supplierCount} · OC: ${result.totals.poCount} · Comprometido: ${result.totals.committedCost}${result.apAvailable ? ` · Exposición: ${result.totals.expectedExposure} · Saldo CxP: ${result.totals.payableBalance}` : ""}`}
      columns={[
        { key: "name", label: "Proveedor", flex: 1.4 },
        { key: "pos", label: "OC", flex: 0.45 },
        { key: "invoices", label: "Fact.", flex: 0.45 },
        { key: "committed", label: "Comprom.", flex: 0.85 },
        { key: "accrued", label: "Deveng.", flex: 0.85 },
        { key: "paid", label: "Pagado", flex: 0.8 },
        { key: "exposure", label: "Exposición", flex: 0.9 },
        { key: "share", label: "%", flex: 0.45 },
        { key: "payable", label: "Saldo CxP", flex: 0.85 },
      ]}
      rows={result.rows.map((r) => ({
        name: r.supplierName,
        pos: String(r.poCount),
        invoices: result.apAvailable ? String(r.invoiceCount) : "—",
        committed: r.committedCost,
        accrued: result.apAvailable ? r.accruedCost : "—",
        paid: result.apAvailable ? r.paidCost : "—",
        exposure: result.apAvailable ? r.expectedExposure : "—",
        share: result.apAvailable && r.shareOfExposurePct ? `${r.shareOfExposurePct}%` : "—",
        payable: result.apAvailable ? r.payableBalance : "—",
      }))}
      warnings={result.warnings}
    />
  ));
}

export async function exportProjectCashFlowPdf(
  projectId: string,
  filters: ProjectCashFlowFilters,
  ctx: ServiceContext,
): Promise<ReportPdfPayload> {
  const report = await getProjectCashFlowReport(projectId, filters, ctx);
  if (report.currencies.length === 0) {
    throw new ServiceError("CONFLICT", "Sin movimientos de caja para exportar");
  }
  const exclusions = report.warnings.sectionsExcluded ?? [];
  const inflowsAvailable = !exclusions.some((entry) => entry.module === "AR");
  const outflowsAvailable = !exclusions.some((entry) => entry.module === "AP");
  const slug = `${report.project.code ?? projectId}_${report.dateFrom}_${report.dateTo}`.replace(
    /[^a-zA-Z0-9._-]+/g,
    "_",
  );
  return exportPdfDocument(ctx, { projectId }, `flujo_caja_${slug}`, (branding) => (
    <ProjectSimpleTablePdfDocument
      branding={branding}
      title="Flujo de caja — proyecto"
      subtitle={`${report.project.name} · ${report.dateFrom} → ${report.dateTo}`}
      filterLine={buildPdfFilterLine({
        period: report.period,
        currency: filters.currency,
      })}
      warnings={[
        ...(report.warnings.multiCurrency ? ["Los totales se presentan por moneda."] : []),
        ...exclusions.map(({ module, reason }) =>
          `${module === "AR" ? "Cobranzas omitidas" : "Pagos omitidos"} · ${reason === "MISSING_PERMISSION" ? "Sin permiso" : "Módulo deshabilitado"}`,
        ),
      ]}
      columns={[
        { key: "currency", label: "Moneda", flex: 0.5 },
        { key: "period", label: "Período", flex: 1.1 },
        { key: "inflows", label: "Ingresos", flex: 0.9 },
        { key: "outflows", label: "Egresos", flex: 0.9 },
        { key: "net", label: exclusions.length > 0 ? "Saldo visible" : "Neto", flex: 0.9 },
      ]}
      rows={[
        ...report.currencies.map((cur) => ({
          currency: cur.currency,
          period: "Total",
          inflows: inflowsAvailable ? cur.totalInflows : "—",
          outflows: outflowsAvailable ? cur.totalOutflows : "—",
          net: cur.netCashFlow,
        })),
        ...report.currencies.flatMap((cur) => cur.periods.map((p) => ({
          currency: cur.currency,
          period: p.periodLabel,
          inflows: inflowsAvailable ? p.inflows : "—",
          outflows: outflowsAvailable ? p.outflows : "—",
          net: p.netCashFlow,
        }))),
      ]}
    />
  ));
}

export async function exportTreasuryCashFlowPdf(
  filters: CashFlowFilters,
  ctx: ServiceContext,
): Promise<ReportPdfPayload> {
  const report = await getCashFlowReport(filters, ctx);
  if (report.length === 0) {
    throw new ServiceError("CONFLICT", "Sin movimientos para exportar flujo de caja");
  }
  const rows: Record<string, string>[] = [];
  for (const cur of report) {
    rows.push({
      period: `${cur.currency} — apertura`,
      inflows: "",
      outflows: "",
      net: cur.openingBalance,
    });
    for (const b of cur.buckets) {
      rows.push({
        period: `${cur.currency} · ${b.period}`,
        inflows: b.inflow,
        outflows: b.outflow,
        net: b.netCashFlow,
      });
    }
    rows.push({
      period: `${cur.currency} — cierre`,
      inflows: "",
      outflows: "",
      net: cur.closingBalance,
    });
  }
  return exportPdfDocument(ctx, {}, "tesoreria_flujo_caja", (branding) => (
    <ProjectSimpleTablePdfDocument
      branding={branding}
      title="Flujo de caja — tesorería"
      filterLine={buildPdfFilterLine({
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        period: filters.period,
        currency: filters.currency,
      })}
      columns={[
        { key: "period", label: "Período", flex: 1.3 },
        { key: "inflows", label: "Ingresos", flex: 0.9 },
        { key: "outflows", label: "Egresos", flex: 0.9 },
        { key: "net", label: "Neto / Saldo", flex: 0.9 },
      ]}
      rows={rows}
    />
  ));
}

export async function exportTreasuryMovementsPdf(
  filters: MovementReportFilters,
  ctx: ServiceContext,
  labels: MovementExportLabels = TREASURY_MOVEMENTS_EXPORT_LABELS,
): Promise<ReportPdfPayload> {
  if (!filters.accountId && (!filters.dateFrom || !filters.dateTo)) {
    throw new ServiceError(
      "VALIDATION",
      "Export de movimientos requiere rango de fechas cuando no hay cuenta seleccionada.",
    );
  }
  const { rows, total } = await getAccountMovementReport(
    filters,
    ctx,
    "export",
  );
  if (total > MAX_EXPORT_ROWS) {
    throw new ServiceError(
      "VALIDATION",
      `El export supera ${MAX_EXPORT_ROWS} filas. Acotá el rango de fechas.`,
    );
  }
  return exportPdfDocument(ctx, {}, labels.filenameBase, (branding) => (
    <ProjectSimpleTablePdfDocument
      branding={branding}
      title={labels.title}
      filterLine={[
        buildPdfFilterLine({
          accountId: filters.accountId,
          dateFrom: filters.dateFrom,
          dateTo: filters.dateTo,
          currency: filters.currency,
        }),
        filters.dateBasis === "value" ? "Fecha valor (contable si falta)" : "Fecha contable",
      ].filter(Boolean).join(" · ")}
      columns={[
        { key: "date", label: "Fecha contable", flex: 0.8 },
        { key: "valueDate", label: "Fecha valor", flex: 0.8 },
        { key: "account", label: "Cuenta", flex: 0.95 },
        { key: "class", label: "Clase", flex: 0.9 },
        { key: "invoice", label: "Factura", flex: 0.7 },
        { key: "counterparty", label: "Contraparte", flex: 0.95 },
        { key: "amount", label: "Importe", flex: 0.8 },
        { key: "currency", label: "Mon.", flex: 0.4 },
        { key: "desc", label: "Descripción", flex: 1.1 },
      ]}
      rows={rows.map((r) => ({
        date: formatDbDate(r.movementDate),
        valueDate: r.valueDate == null ? "Sin registrar" : formatDbDate(r.valueDate),
        account: r.accountName,
        class: r.classLabel || "",
        invoice: r.documentRef ?? "",
        counterparty: r.counterpartyName
          ? r.externalInvoiceRef
            ? `${r.counterpartyName} (${r.externalInvoiceRef})`
            : r.counterpartyName
          : (r.externalInvoiceRef ?? ""),
        amount: r.signedAmount,
        currency: r.currency,
        desc: r.description,
      }))}
    />
  ));
}

export async function exportTreasuryCashPositionPdf(
  filters: CashPositionFilters,
  ctx: ServiceContext,
): Promise<ReportPdfPayload> {
  const report = await getCashPositionReport(filters, ctx);
  return exportPdfDocument(ctx, {}, "tesoreria_posicion_caja", (branding) => (
    <ProjectSimpleTablePdfDocument
      branding={branding}
      title="Posición de caja"
      filterLine={buildPdfFilterLine({
        companyId: filters.companyId,
        currency: filters.currency,
      })}
      totalsLine={
        report.byCurrency.length > 0
          ? [
              ...report.byCurrency.map((c) => `${c.currency}: ${c.totalBalance}`),
              report.consolidatedArs == null ? "Equivalencia histórica ARS incompleta" : `Equivalente histórico ARS: ${report.consolidatedArs}`,
            ].join(" · ")
          : undefined
      }
      columns={[
        { key: "company", label: "Empresa", flex: 1 },
        { key: "account", label: "Cuenta", flex: 1.1 },
        { key: "type", label: "Tipo", flex: 0.7 },
        { key: "currency", label: "Mon.", flex: 0.5 },
        { key: "balance", label: "Saldo", flex: 0.9 },
      ]}
      rows={report.accounts.map((a) => ({
        company: a.companyName ?? "",
        account: a.name,
        type: a.type,
        currency: a.currency,
        balance: a.balance,
      }))}
    />
  ));
}

export async function exportStockBalancePdf(
  filters: StockBalanceFilters,
  ctx: ServiceContext,
): Promise<ReportPdfPayload> {
  const data = await getStockBalanceReport(filters, ctx);
  return exportPdfDocument(ctx, {}, "inventario_stock", (branding) => (
    <ProjectSimpleTablePdfDocument
      branding={branding}
      title="Stock actual"
      columns={[
        { key: "sku", label: "SKU", flex: 0.7 },
        { key: "product", label: "Producto", flex: 1.2 },
        { key: "warehouse", label: "Depósito", flex: 0.9 },
        { key: "qty", label: "Cantidad", flex: 0.7 },
        { key: "unit", label: "Un.", flex: 0.45 },
      ]}
      rows={data.map((r) => ({
        sku: r.productSku,
        product: r.productName,
        warehouse: r.warehouseName,
        qty: r.quantityOnHand,
        unit: r.productUnit,
      }))}
    />
  ));
}

export async function exportStockMovementsPdf(
  filters: StockMovementReportFilters,
  ctx: ServiceContext,
): Promise<ReportPdfPayload> {
  const data = await getStockMovementReport(filters, ctx);
  return exportPdfDocument(ctx, {}, "inventario_movimientos", (branding) => (
    <ProjectSimpleTablePdfDocument
      branding={branding}
      title="Movimientos de inventario"
      filterLine={buildPdfFilterLine({
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        warehouseId: filters.warehouseId,
        productId: filters.productId,
      })}
      columns={[
        { key: "date", label: "Fecha", flex: 0.85 },
        { key: "sku", label: "SKU", flex: 0.65 },
        { key: "product", label: "Producto", flex: 1 },
        { key: "type", label: "Tipo", flex: 0.65 },
        { key: "qty", label: "Cant.", flex: 0.6 },
        { key: "warehouse", label: "Depósito", flex: 0.85 },
      ]}
      rows={data.map((r) => ({
        date: r.movementDate,
        sku: r.productSku,
        product: r.productName,
        type: r.type,
        qty: r.signedQuantity ?? "Sin dirección definida",
        warehouse: r.warehouseName,
      }))}
    />
  ));
}

export async function exportCompanyPayablesPdf(
  filters: CompanyPayableListFilters,
  ctx: ServiceContext,
): Promise<ReportPdfPayload> {
  const { data, total } = await listCompanyPayables(ctx, {
    ...filters,
    page: 1,
    pageSize: MAX_EXPORT_ROWS,
  });
  if (total > MAX_EXPORT_ROWS) {
    throw new ServiceError(
      "VALIDATION",
      `El export supera ${MAX_EXPORT_ROWS} filas. Acotá los filtros de vencimiento.`,
    );
  }
  return exportPdfDocument(ctx, {}, "finanzas_cxp_corporativo", (branding) => (
    <ProjectSimpleTablePdfDocument
      branding={branding}
      title="Cuentas por pagar"
      filterLine={buildPdfFilterLine({
        status: filters.status,
        dueDateFrom: filters.dueDateFrom,
        dueDateTo: filters.dueDateTo,
      })}
      columns={[
        { key: "supplier", label: "Proveedor", flex: 1.1 },
        { key: "invoice", label: "Factura", flex: 0.7 },
        { key: "due", label: "Venc.", flex: 0.75 },
        { key: "status", label: "Estado", flex: 0.65 },
        { key: "balance", label: "Saldo", flex: 0.85 },
        { key: "currency", label: "Mon.", flex: 0.45 },
      ]}
      rows={data.map((p) => ({
        supplier: p.supplierName,
        invoice: p.supplierInvoiceCode ?? "",
        due:
          p.dueDate instanceof Date
            ? p.dueDate.toISOString().slice(0, 10)
            : String(p.dueDate).slice(0, 10),
        status: p.status,
        balance: p.balanceDue,
        currency: p.currency,
      }))}
    />
  ));
}

export async function exportCompanySupplierInvoicesPdf(
  filters: CompanySupplierInvoiceListFilters,
  ctx: ServiceContext,
): Promise<ReportPdfPayload> {
  const data = await readCompanySupplierInvoicesForExport(filters, ctx);
  const notice = data.length > MAX_PROJECT_REPORT_PDF_ROWS
    ? `Detalle truncado: ${data.length - MAX_PROJECT_REPORT_PDF_ROWS} filas omitidas (límite ${MAX_PROJECT_REPORT_PDF_ROWS}). Exportá Excel para el detalle completo.`
    : undefined;
  return exportPdfDocument(ctx, {}, "finanzas_facturas_proveedor_corporativo", (branding) => (
    <ProjectSimpleTablePdfDocument
      branding={branding}
      title="Facturas y gastos"
      subtitle={`${data.length} registros encontrados`}
      warnings={notice ? [notice] : undefined}
      footerNote={notice}
      filterLine={buildPdfFilterLine({
        status: filters.status,
        issueDateFrom: filters.issueDateFrom,
        issueDateTo: filters.issueDateTo,
      })}
      columns={[
        { key: "code", label: "Código", flex: 0.75 },
        { key: "supplier", label: "Proveedor", flex: 1.1 },
        { key: "issue", label: "Emisión", flex: 0.75 },
        { key: "due", label: "Venc.", flex: 0.75 },
        { key: "status", label: "Estado", flex: 0.65 },
        { key: "total", label: "Total", flex: 0.85 },
        { key: "currency", label: "Mon.", flex: 0.45 },
      ]}
      rows={data.map((inv) => ({
        code: inv.code,
        supplier: inv.supplierName,
        issue:
          inv.issueDate instanceof Date
            ? inv.issueDate.toISOString().slice(0, 10)
            : String(inv.issueDate).slice(0, 10),
        due:
          inv.dueDate instanceof Date
            ? inv.dueDate.toISOString().slice(0, 10)
            : String(inv.dueDate).slice(0, 10),
        status: inv.status,
        total: inv.totalAmount,
        currency: inv.currency,
      }))}
    />
  ));
}

export async function exportJobsiteLogPdf(
  logId: string,
  projectId: string,
  ctx: ServiceContext,
): Promise<ReportPdfPayload> {
  const payload = await buildJobsiteLogPdfPayload(logId, projectId, ctx);
  return exportPdfDocument(
    ctx,
    { projectId },
    `libro_obra_parte_${payload.meta.logDateIso}_${payload.meta.status.toLowerCase()}`,
    (branding) => <JobsiteLogPdfDocument payload={payload} branding={branding} />,
  );
}

export async function exportSchedulePdf(
  projectId: string,
  filters: ScheduleExportFilters,
  ctx: ServiceContext,
): Promise<ReportPdfPayload> {
  const payload = await buildScheduleExportPayload(projectId, filters, ctx);
  const slug = payload.budgetName.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 60);
  const viewSuffix = payload.view === "both" ? "" : `_${payload.view}`;
  return exportPdfDocument(ctx, { projectId }, `cronograma_${slug}${viewSuffix}`, (branding) => (
    <SchedulePdfDocument payload={payload} branding={branding} />
  ));
}

export async function exportTrialBalancePdf(
  input: AccountingReportDateRange,
  ctx: ServiceContext,
): Promise<ReportPdfPayload> {
  const report = await getTrialBalanceReport(ctx, input);
  return exportPdfDocument(
    ctx,
    {},
    `contabilidad_sumas_y_saldos_${report.dateFrom}_${report.dateTo}`,
    (branding) => (
      <ProjectSimpleTablePdfDocument
        branding={branding}
        title="Sumas y saldos"
        subtitle="Información gerencial interna. Solo asientos contabilizados."
        filterLine={`Período ${report.dateFrom} — ${report.dateTo}`}
        columns={[
          { key: "code", label: "Código", flex: 0.7 },
          { key: "name", label: "Cuenta", flex: 1.4 },
          { key: "type", label: "Tipo", flex: 0.7 },
          { key: "currency", label: "Mon.", flex: 0.45 },
          { key: "debit", label: "Debe", flex: 0.8 },
          { key: "credit", label: "Haber", flex: 0.8 },
          { key: "balance", label: "Saldo", flex: 0.8 },
        ]}
        rows={report.rows.map((r) => ({
          code: r.accountCode,
          name: r.accountName,
          type: r.accountType,
          currency: r.currency,
          debit: r.debit,
          credit: r.credit,
          balance: r.balance,
        }))}
        footerNote="Saldo natural por tipo de cuenta. No sustituye estados oficiales."
      />
    ),
  );
}

export async function exportJournalBookPdf(
  input: AccountingReportDateRange,
  ctx: ServiceContext,
): Promise<ReportPdfPayload> {
  const book = await listPostedJournalBookForExport(ctx, input, MAX_EXPORT_ROWS);
  if (book.total > MAX_EXPORT_ROWS) {
    throw new ServiceError(
      "VALIDATION",
      `El export supera ${MAX_EXPORT_ROWS} asientos. Acotá el rango de fechas.`,
    );
  }
  const rows: Record<string, string>[] = [];
  for (const e of book.data) {
    for (const l of e.lines) {
      rows.push({
        date: e.entryDate,
        ref: e.reference ?? e.id.slice(0, 8),
        account: `${l.accountCode} ${l.accountName}`,
        debit: l.debit,
        credit: l.credit,
        currency: l.currency,
        desc: l.description ?? e.description,
      });
    }
  }
  return exportPdfDocument(
    ctx,
    {},
    `contabilidad_libro_diario_${book.dateFrom}_${book.dateTo}`,
    (branding) => (
      <ProjectSimpleTablePdfDocument
        branding={branding}
        title="Libro diario"
        subtitle="Información gerencial interna. Solo asientos contabilizados."
        filterLine={`Período ${book.dateFrom} — ${book.dateTo}`}
        columns={[
          { key: "date", label: "Fecha", flex: 0.75 },
          { key: "ref", label: "Ref.", flex: 0.7 },
          { key: "account", label: "Cuenta", flex: 1.4 },
          { key: "debit", label: "Debe", flex: 0.7 },
          { key: "credit", label: "Haber", flex: 0.7 },
          { key: "currency", label: "Mon.", flex: 0.45 },
          { key: "desc", label: "Descripción", flex: 1.2 },
        ]}
        rows={rows}
      />
    ),
  );
}

export async function exportAccountLedgerPdf(
  input: AccountingReportDateRange & { accountId: string },
  ctx: ServiceContext,
): Promise<ReportPdfPayload> {
  const report = await getAccountLedgerReport(ctx, { ...input, limit: MAX_ACCOUNT_LEDGER_ROWS });
  if (report.truncated) {
    throw new ServiceError("VALIDATION", `El mayor supera ${MAX_ACCOUNT_LEDGER_ROWS} movimientos. Acotá el rango de fechas.`);
  }
  return exportPdfDocument(
    ctx,
    {},
    `contabilidad_mayor_${report.accountCode}_${report.dateFrom}_${report.dateTo}`,
    (branding) => (
      <ProjectSimpleTablePdfDocument
        branding={branding}
        title={`Mayor — ${report.accountCode} ${report.accountName}`}
        subtitle="Saldo corrido natural. Solo asientos contabilizados."
        filterLine={`Período ${report.dateFrom} — ${report.dateTo}`}
        columns={[
          { key: "date", label: "Fecha", flex: 0.75 },
          { key: "ref", label: "Ref.", flex: 0.7 },
          { key: "desc", label: "Descripción", flex: 1.4 },
          { key: "debit", label: "Debe", flex: 0.7 },
          { key: "credit", label: "Haber", flex: 0.7 },
          { key: "balance", label: "Saldo", flex: 0.75 },
          { key: "currency", label: "Mon.", flex: 0.45 },
        ]}
        rows={report.rows.map((r) => ({
          date: r.entryDate,
          ref: r.isOpening
            ? "Saldo inicial"
            : (r.entryReference ?? (r.entryId ? r.entryId.slice(0, 8) : "—")),
          desc: r.lineDescription
            ? `${r.entryDescription} — ${r.lineDescription}`
            : r.entryDescription,
          debit: r.isOpening ? "—" : r.debit,
          credit: r.isOpening ? "—" : r.credit,
          balance: r.runningBalance,
          currency: r.currency,
        }))}
      />
    ),
  );
}

export async function exportStatementOfFinancialPositionPdf(
  input: { companyId?: string | null; asOfDate?: string },
  ctx: ServiceContext,
): Promise<ReportPdfPayload> {
  const report = await getStatementOfFinancialPosition(ctx, input);
  const rows: Record<string, string>[] = [];
  for (const currency of report.currencies) {
    const block = report.byCurrency[currency]!;
    for (const r of block.assets) {
      rows.push({
        currency,
        section: "Activo",
        code: r.accountCode,
        name: r.accountName,
        balance: r.balance,
      });
    }
    for (const r of block.liabilities) {
      rows.push({
        currency,
        section: "Pasivo",
        code: r.accountCode,
        name: r.accountName,
        balance: r.balance,
      });
    }
    for (const r of block.equity) {
      rows.push({
        currency,
        section: "Patrimonio",
        code: r.accountCode,
        name: r.accountName,
        balance: r.balance,
      });
    }
    rows.push({
      currency,
      section: "Totales",
      code: "",
      name: `A ${block.totalAssets} · P ${block.totalLiabilities} · PN ${block.totalEquity}`,
      balance: block.balanced ? "Cuadra" : "Desvío",
    });
  }
  return exportPdfDocument(
    ctx,
    {},
    `contabilidad_situacion_patrimonial_${report.asOfDate}`,
    (branding) => (
      <ProjectSimpleTablePdfDocument
        branding={branding}
        title="Situación patrimonial"
        subtitle="Gerencial interno. Incluye Resultado del ejercicio (no cerrado)."
        filterLine={`Al ${report.asOfDate}`}
        columns={[
          { key: "currency", label: "Mon.", flex: 0.45 },
          { key: "section", label: "Sección", flex: 0.8 },
          { key: "code", label: "Código", flex: 0.65 },
          { key: "name", label: "Cuenta", flex: 1.6 },
          { key: "balance", label: "Saldo", flex: 0.85 },
        ]}
        rows={rows}
        footerNote="No sustituye estados contables oficiales ni ajuste por inflación."
      />
    ),
  );
}

export async function exportIncomeStatementPdf(
  input: AccountingReportDateRange,
  ctx: ServiceContext,
): Promise<ReportPdfPayload> {
  const report = await getIncomeStatement(ctx, input);
  const rows: Record<string, string>[] = [];
  for (const currency of report.currencies) {
    const block = report.byCurrency[currency]!;
    for (const r of block.income) {
      rows.push({
        currency,
        section: "Ingresos",
        code: r.accountCode,
        name: r.accountName,
        balance: r.balance,
      });
    }
    for (const r of block.expenses) {
      rows.push({
        currency,
        section: "Gastos",
        code: r.accountCode,
        name: r.accountName,
        balance: r.balance,
      });
    }
    rows.push({
      currency,
      section: "Resultado",
      code: "",
      name: `Ingresos ${block.totalIncome} − Gastos ${block.totalExpenses}`,
      balance: block.netResult,
    });
  }
  return exportPdfDocument(
    ctx,
    {},
    `contabilidad_estado_resultados_${report.dateFrom}_${report.dateTo}`,
    (branding) => (
      <ProjectSimpleTablePdfDocument
        branding={branding}
        title="Estado de resultados"
        subtitle="Información gerencial interna. Solo asientos contabilizados."
        filterLine={`Período ${report.dateFrom} — ${report.dateTo}`}
        columns={[
          { key: "currency", label: "Mon.", flex: 0.45 },
          { key: "section", label: "Sección", flex: 0.8 },
          { key: "code", label: "Código", flex: 0.65 },
          { key: "name", label: "Cuenta", flex: 1.6 },
          { key: "balance", label: "Saldo", flex: 0.85 },
        ]}
        rows={rows}
        footerNote="No sustituye estados contables oficiales ni ajuste por inflación."
      />
    ),
  );
}

export async function exportProjectPortfolioPdf(
  ctx: ServiceContext,
  filters?: { status?: string },
): Promise<ReportPdfPayload> {
  const status = parsePortfolioReportStatus(filters?.status);
  const report = await getProjectPortfolioReport(ctx, { status });
  return exportPdfDocument(ctx, {}, "portafolio_proyectos", (branding) => (
    <ProjectSimpleTablePdfDocument
      branding={branding}
      title="Portafolio de proyectos"
      subtitle="Presupuesto, comprometido, devengado y exposición por obra"
      warnings={report.warnings}
      columns={[
        { key: "code", label: "Código", flex: 0.7 },
        { key: "name", label: "Proyecto", flex: 1.4 },
        { key: "status", label: "Estado", flex: 0.7 },
        { key: "currency", label: "Moneda", flex: 0.55 },
        { key: "budget", label: "Presup.", flex: 0.8 },
        { key: "committed", label: "Comprom.", flex: 0.8 },
        { key: "accrued", label: "Deveng.", flex: 0.8 },
        { key: "exposure", label: "Exposición", flex: 0.85 },
        { key: "variance", label: "Var.", flex: 0.7 },
      ]}
      rows={report.rows.map((r) => ({
        code: r.code,
        name: r.name,
        status: r.status,
        currency: r.currency ?? "—",
        budget: r.currency ? r.budgetTotalCost : "—",
        committed: r.currency ? r.committedCost : "—",
        accrued: r.currency ? r.accruedCost : "—",
        exposure: r.currency ? r.expectedCostExposure : "—",
        variance: r.currency ? r.costVariance : "—",
      }))}
    />
  ));
}

export async function exportPortfolioProfitabilityPdf(
  ctx: ServiceContext,
  filters?: { costLayer?: string; revenueBasis?: string; status?: string },
): Promise<ReportPdfPayload> {
  const appliedFilters = parsePortfolioProfitabilityExportFilters(filters);
  const report = await getPortfolioProfitabilityReport(ctx, appliedFilters);
  const rows = [
    ...report.rows.map((r) => ({
      code: r.code,
      name: r.name,
      currency: r.currency ?? "",
      revenue: r.revenue ?? "—",
      cost: r.directCost ?? "—",
      margin: r.grossMargin ?? "—",
      pct: r.grossMarginPct ?? "",
    })),
    {
      code: "",
      name: "CONSOLIDADO",
      currency: report.consolidatedCurrency ?? "",
      revenue: report.consolidatedRevenue ?? "—",
      cost: report.consolidatedDirectCost ?? "—",
      margin: report.consolidatedGrossMargin ?? "—",
      pct: report.consolidatedGrossMarginPct ?? "",
    },
  ];
  return exportPdfDocument(ctx, {}, "rentabilidad_multi_obra", (branding) => (
    <ProjectSimpleTablePdfDocument
      branding={branding}
      title="Rentabilidad multi-obra"
      subtitle={`${appliedFilters.revenueBasis === "invoiced" ? "Facturado neto" : "Ingresos certificados"} · ${PORTFOLIO_COST_LAYER_LABELS[appliedFilters.costLayer]}`}
      warnings={report.warnings}
      columns={[
        { key: "code", label: "Código", flex: 0.7 },
        { key: "name", label: "Proyecto", flex: 1.6 },
        { key: "currency", label: "Moneda", flex: 0.55 },
        { key: "revenue", label: "Ingresos", flex: 0.9 },
        { key: "cost", label: "Costos", flex: 0.9 },
        { key: "margin", label: "Margen", flex: 0.9 },
        { key: "pct", label: "MB %", flex: 0.6 },
      ]}
      rows={rows}
    />
  ));
}

export async function exportOverheadByProjectPdf(
  ctx: ServiceContext,
  filters?: { periodFrom?: string; periodTo?: string; dateFrom?: string; dateTo?: string },
): Promise<ReportPdfPayload> {
  const periodFrom = filters?.periodFrom ?? filters?.dateFrom;
  const periodTo = filters?.periodTo ?? filters?.dateTo;
  const report = await getOverheadByProjectReport(ctx, { periodFrom, periodTo });
  return exportPdfDocument(ctx, {}, "gastos_generales_por_proyecto", (branding) => (
    <ProjectSimpleTablePdfDocument
      branding={branding}
      title="Gastos generales por proyecto"
      filterLine={buildPdfFilterLine({ periodFrom, periodTo })}
      warnings={report.warnings}
      columns={[
        { key: "code", label: "Código", flex: 0.7 },
        { key: "name", label: "Proyecto", flex: 1.5 },
        { key: "period", label: "Período", flex: 0.7 },
        { key: "currency", label: "Mon.", flex: 0.45 },
        { key: "amount", label: "Monto", flex: 0.85 },
        { key: "notes", label: "Notas", flex: 1.2 },
      ]}
      rows={report.rows.map((r) => ({
        code: r.projectCode,
        name: r.projectName,
        period: r.period,
        currency: r.currency,
        amount: r.amount,
        notes: r.notes ?? "",
      }))}
    />
  ));
}

export async function exportMultiProjectProcurementPdf(
  ctx: ServiceContext,
  filters?: { dateFrom?: string; dateTo?: string },
): Promise<ReportPdfPayload> {
  const report = await getMultiProjectProcurementReport(ctx, filters);
  const rows = [
    ...report.topSuppliers.map((s) => ({
      section: "Proveedores",
      supplier: s.supplierName,
      currency: s.currency,
      project: "",
      po: "",
      committed: s.committedCost,
      accrued: report.apAvailable ? s.accruedCost : "—",
      paid: report.apAvailable ? s.paidCost : "—",
      status: "",
      total: "",
    })),
    ...report.openPurchaseOrders.map((po) => ({
      section: "OC abiertas",
      supplier: po.supplierName,
      currency: po.currency,
      project: `${po.projectCode} — ${po.projectName}`,
      po: po.poNumber,
      committed: "",
      accrued: "",
      paid: "",
      status: po.status,
      total: po.totalAmount,
    })),
  ];
  return exportPdfDocument(ctx, {}, "compras_multi_obra", (branding) => (
    <ProjectSimpleTablePdfDocument
      branding={branding}
      title="Compras multi-obra"
      filterLine={buildPdfFilterLine({ dateFrom: filters?.dateFrom, dateTo: filters?.dateTo })}
      warnings={report.warnings}
      columns={[
        { key: "section", label: "Sección", flex: 0.8 },
        { key: "supplier", label: "Proveedor", flex: 1.3 },
        { key: "project", label: "Obra", flex: 1.2 },
        { key: "po", label: "OC", flex: 0.6 },
        { key: "status", label: "Estado", flex: 0.8 },
        { key: "currency", label: "Moneda", flex: 0.55 },
        { key: "committed", label: "Comprom.", flex: 0.8 },
        { key: "accrued", label: "Deveng.", flex: 0.8 },
        { key: "paid", label: "Pagado", flex: 0.7 },
        { key: "total", label: "Monto total", flex: 0.8 },
      ]}
      rows={rows}
    />
  ));
}
