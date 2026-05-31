import type { ReactElement } from "react";
import type { DocumentProps } from "@react-pdf/renderer";
import { AUDIT_UI_MODULE_LABEL_ES } from "@bloqer/domain";
import {
  fetchTenantAuditLogForExport,
  formatAuditLogExportFilterLine,
  getAccountMovementReport,
  getBudgetVarianceReport,
  getCashFlowReport,
  getCashPositionReport,
  getCertificationEvolutionReport,
  getMaterialVarianceReport,
  getPayableAgingReport,
  getProcurementDeviationReport,
  getProjectCashFlowReport,
  getProjectCostControl,
  getProjectIncomeExpenseReport,
  getProjectProfitabilityReport,
  getReceivableAgingReport,
  getStockBalanceReport,
  getStockMovementReport,
  getSubcontractVarianceReport,
  listCompanyPayables,
  listCompanySupplierInvoices,
  MAX_EXPORT_ROWS,
  ServiceError,
  type AgingFilters,
  type BudgetVarianceFilters,
  type BudgetWbsExportFilters,
  budgetWbsExportPdfColumns,
  budgetWbsExportPdfRowsFromTable,
  buildBudgetWbsExportPayload,
  type CashFlowFilters,
  type CashPositionFilters,
  type CertificationReportFilters,
  type CompanyPayableListFilters,
  type CompanySupplierInvoiceListFilters,
  type CostControlFilters,
  type IncomeExpenseFilters,
  type ListTenantAuditLogFilters,
  type MaterialReportFilters,
  type MovementReportFilters,
  type ProcurementReportFilters,
  type ProfitabilityFilters,
  type ProjectCashFlowFilters,
  type ServiceContext,
  type StockBalanceFilters,
  type StockMovementReportFilters,
  type SubcontractReportFilters,
  type TenantAuditLogExportUrlFilters,
} from "@bloqer/services";
import { resolvePdfReportBranding } from "./branding/pdf-branding.service";
import type { PdfReportBranding } from "./branding/pdf-branding.types";
import { safeReportFilename } from "./filename.service";
import { AgingReportPdfDocument } from "./pdf/aging-pdf";
import { CostControlReportPdfDocument } from "./pdf/cost-control-pdf";
import { ProjectSimpleTablePdfDocument } from "./pdf/project-simple-table-pdf";
import type { ReportPdfPayload } from "./pdf/pdf-export.types";
import { MAX_AUDIT_LOG_PDF_ROWS } from "./pdf/pdf-export.types";
import { renderReportPdfToBuffer } from "./pdf/pdf-renderer.service";
import { buildPdfFilterLine } from "./pdf/pdf-filter-line";

type BrandingScope = { projectId?: string };

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
  return exportPdfDocument(ctx, { projectId: filters.projectId }, `aging_cxc_${report.asOfDate}`, (branding) => (
    <AgingReportPdfDocument variant="AR" report={report} filters={filters} branding={branding} />
  ));
}

export async function exportPayableAgingPdf(
  filters: AgingFilters,
  ctx: ServiceContext,
): Promise<ReportPdfPayload> {
  const report = await getPayableAgingReport(filters, ctx);
  return exportPdfDocument(ctx, { projectId: filters.projectId }, `aging_cxp_${report.asOfDate}`, (branding) => (
    <AgingReportPdfDocument variant="AP" report={report} filters={filters} branding={branding} />
  ));
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
  const slug = `${result.budgetName}_${filters.dateFrom ?? "all"}_${filters.dateTo ?? "all"}`
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
  return exportPdfDocument(ctx, { projectId }, `presupuesto_vs_real_${report.budgetName}`, (branding) => (
    <ProjectSimpleTablePdfDocument
      branding={branding}
      title="Presupuesto vs real"
      subtitle={`${report.budgetName}`}
      filterLine={buildPdfFilterLine({ budgetId: filters.budgetId, costLayer: filters.costLayer })}
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
  ));
}

export async function exportBudgetWbsPdf(
  budgetId: string,
  projectId: string,
  filters: BudgetWbsExportFilters,
  ctx: ServiceContext,
): Promise<ReportPdfPayload> {
  const payload = await buildBudgetWbsExportPayload(budgetId, projectId, filters, ctx);
  const rows = budgetWbsExportPdfRowsFromTable(filters.view, payload.rows);
  const slug = `${payload.meta.budgetName}_v${payload.meta.versionNumber}_${payload.meta.view}`.replace(
    /[^a-zA-Z0-9._-]+/g,
    "_",
  );
  return exportPdfDocument(ctx, { projectId }, `presupuesto_edt_${slug}`, (branding) => (
    <ProjectSimpleTablePdfDocument
      branding={branding}
      title="Presupuesto — EDT"
      subtitle={`${payload.meta.budgetName} · v${payload.meta.versionNumber}`}
      filterLine={`Moneda: ${payload.meta.currency} · Vista: ${payload.meta.viewLabel}`}
      totalsLine={`Costo directo: ${payload.meta.totalCostDirect} · Total venta: ${payload.meta.totalSalePrice}`}
      columns={budgetWbsExportPdfColumns(filters.view)}
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
  return exportPdfDocument(ctx, { projectId }, `certificaciones_${report.budgetName}`, (branding) => (
    <ProjectSimpleTablePdfDocument
      branding={branding}
      title="Certificaciones — evolución"
      subtitle={report.budgetName}
      filterLine={buildPdfFilterLine({ dateFrom: filters.dateFrom, dateTo: filters.dateTo })}
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
    />
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
      title="Subcontratos — varianza"
      subtitle={`${report.budgetName} · ${report.pendingContractCount} sin contrato`}
      filterLine={buildPdfFilterLine({ dateFrom: filters.dateFrom, dateTo: filters.dateTo })}
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
    />
  ));
}

export async function exportProjectIncomeExpensePdf(
  projectId: string,
  filters: IncomeExpenseFilters,
  ctx: ServiceContext,
): Promise<ReportPdfPayload> {
  const report = await getProjectIncomeExpenseReport(projectId, filters, ctx);
  return exportPdfDocument(
    ctx,
    { projectId },
    `ingresos_gastos_${report.dateFrom}_${report.dateTo}`,
    (branding) => (
      <ProjectSimpleTablePdfDocument
        branding={branding}
        title="Ingresos vs gastos"
        subtitle={`${report.dateFrom} → ${report.dateTo} · ${report.displayCurrency}`}
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
  return exportPdfDocument(ctx, { projectId }, `rentabilidad_${report.budgetName}`, (branding) => (
    <ProjectSimpleTablePdfDocument
      branding={branding}
      title="Rentabilidad del proyecto"
      subtitle={`${report.budgetName} · ${report.currency}`}
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
    />
  ));
}

export async function exportTenantAuditLogPdf(
  filters: Omit<ListTenantAuditLogFilters, "cursor" | "limit">,
  ctx: ServiceContext,
  urlFilters?: TenantAuditLogExportUrlFilters,
): Promise<ReportPdfPayload> {
  const { rows, truncated } = await fetchTenantAuditLogForExport(
    filters,
    ctx,
    MAX_AUDIT_LOG_PDF_ROWS,
  );

  const pdfRows = rows.map((r) => ({
    createdAt: r.createdAt.toISOString().replace("T", " ").slice(0, 19),
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
      subtitle="Trazabilidad de acciones críticas del tenant"
      filterLine={filterLine}
      maxRows={MAX_AUDIT_LOG_PDF_ROWS}
      columns={[
        { key: "createdAt", label: "Fecha (UTC)", flex: 1.15 },
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
      title="Materiales — varianza"
      subtitle={result.budgetName}
      totalsLine={`Presupuesto: ${result.totals.budgetMaterial} · Consumo: ${result.totals.consumedCost} · Var.: ${result.totals.variance}`}
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
        actual: r.consumedCost,
        variance: r.variance,
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
  return exportPdfDocument(ctx, { projectId }, `compras_${result.budgetName}`, (branding) => (
    <ProjectSimpleTablePdfDocument
      branding={branding}
      title="Compras y proveedores"
      subtitle={result.budgetName}
      filterLine={buildPdfFilterLine({ dateFrom: filters.dateFrom, dateTo: filters.dateTo })}
      columns={[
        { key: "code", label: "Partida", flex: 0.7 },
        { key: "name", label: "Ítem", flex: 1.2 },
        { key: "budget", label: "Presup.", flex: 0.85 },
        { key: "committed", label: "Comprom.", flex: 0.85 },
        { key: "accrued", label: "Deveng.", flex: 0.85 },
        { key: "variance", label: "Var.", flex: 0.75 },
      ]}
      rows={result.byWbs.map((r) => ({
        code: r.wbsCode,
        name: r.wbsName,
        budget: r.budgetMaterial,
        committed: r.committedCost,
        accrued: r.accruedCost,
        variance: r.varianceAmount,
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
  const cur = report.currencies.find((c) => c.currency === "ARS") ?? report.currencies[0];
  if (!cur) {
    throw new ServiceError("CONFLICT", "Sin movimientos de caja para exportar");
  }
  const slug = `${report.project.code ?? projectId}_${report.dateFrom}_${report.dateTo}`.replace(
    /[^a-zA-Z0-9._-]+/g,
    "_",
  );
  return exportPdfDocument(ctx, { projectId }, `flujo_caja_${slug}`, (branding) => (
    <ProjectSimpleTablePdfDocument
      branding={branding}
      title="Flujo de caja — proyecto"
      subtitle={`${report.project.name} · ${report.dateFrom} → ${report.dateTo}`}
      filterLine={buildPdfFilterLine({ period: filters.period, currency: filters.currency ?? cur.currency })}
      totalsLine={`Ingresos: ${cur.totalInflows} · Egresos: ${cur.totalOutflows} · Neto: ${cur.netCashFlow} ${cur.currency}`}
      columns={[
        { key: "period", label: "Período", flex: 1.1 },
        { key: "inflows", label: "Ingresos", flex: 0.9 },
        { key: "outflows", label: "Egresos", flex: 0.9 },
        { key: "net", label: "Neto", flex: 0.9 },
      ]}
      rows={cur.periods.map((p) => ({
        period: p.periodLabel,
        inflows: p.inflows,
        outflows: p.outflows,
        net: p.netCashFlow,
      }))}
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
): Promise<ReportPdfPayload> {
  if (!filters.accountId && (!filters.dateFrom || !filters.dateTo)) {
    throw new ServiceError(
      "VALIDATION",
      "Export de movimientos requiere rango de fechas cuando no hay cuenta seleccionada.",
    );
  }
  const { rows, total } = await getAccountMovementReport(
    { ...filters, page: 1, pageSize: MAX_EXPORT_ROWS },
    ctx,
  );
  if (total > MAX_EXPORT_ROWS) {
    throw new ServiceError(
      "VALIDATION",
      `El export supera ${MAX_EXPORT_ROWS} filas. Acotá el rango de fechas.`,
    );
  }
  return exportPdfDocument(ctx, {}, "tesoreria_movimientos", (branding) => (
    <ProjectSimpleTablePdfDocument
      branding={branding}
      title="Movimientos de tesorería"
      filterLine={buildPdfFilterLine({
        accountId: filters.accountId,
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        currency: filters.currency,
      })}
      columns={[
        { key: "date", label: "Fecha", flex: 0.85 },
        { key: "account", label: "Cuenta", flex: 1 },
        { key: "type", label: "Tipo", flex: 0.7 },
        { key: "amount", label: "Importe", flex: 0.85 },
        { key: "currency", label: "Mon.", flex: 0.45 },
        { key: "desc", label: "Descripción", flex: 1.2 },
      ]}
      rows={rows.map((r) => ({
        date: r.movementDate,
        account: r.accountName,
        type: r.type,
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
          ? report.byCurrency.map((c) => `${c.currency}: ${c.totalBalance}`).join(" · ")
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
        qty: r.signedQuantity,
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
      title="Cuentas por pagar — corporativo"
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
  const { data, total } = await listCompanySupplierInvoices(ctx, {
    ...filters,
    page: 1,
    pageSize: MAX_EXPORT_ROWS,
  });
  if (total > MAX_EXPORT_ROWS) {
    throw new ServiceError(
      "VALIDATION",
      `El export supera ${MAX_EXPORT_ROWS} filas. Acotá el rango de fechas de emisión.`,
    );
  }
  return exportPdfDocument(ctx, {}, "finanzas_facturas_proveedor_corporativo", (branding) => (
    <ProjectSimpleTablePdfDocument
      branding={branding}
      title="Facturas de proveedor — corporativo"
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
