import { projectStatusSchema } from "@bloqer/validators";
import type { AgingBucket, AgingFilters } from "../aging/aging.service";
import { getReceivableAgingReport, getPayableAgingReport } from "../aging/aging.service";
import type {
  CashFlowFilters,
  CashPositionFilters,
  MovementReportFilters,
} from "../treasury-reports/treasury-reports.service";
import {
  getCashFlowReport,
  getCashPositionReport,
  getAccountMovementReport,
} from "../treasury-reports/treasury-reports.service";
import type {
  StockBalanceFilters,
  StockMovementReportFilters,
} from "../inventory-reports/inventory-reports.service";
import {
  getStockBalanceReport,
  getStockMovementReport,
} from "../inventory-reports/inventory-reports.service";
import type { CostControlFilters } from "../cost-control/cost-control.service";
import {
  getProjectCostControl,
  parseCostCategoryFilter,
  sliceCostControlReportByCostType,
} from "../cost-control/cost-control.service";
import type { BudgetVarianceFilters } from "../reports/budget-variance.service";
import {
  getBudgetVarianceReport,
  parseCostVarianceLayer,
} from "../reports/budget-variance.service";
import type { CertificationReportFilters } from "../reports/certification-evolution.service";
import { getCertificationEvolutionReport } from "../reports/certification-evolution.service";
import type { ProcurementReportFilters } from "../reports/procurement-deviation.service";
import { getPurchaseOrderVarianceReport } from "../reports/purchase-order-variance-report.service";
import { getProcurementDeviationReport } from "../reports/procurement-deviation.service";
import type { ProjectSupplierReportFilters } from "../reports/project-supplier-report.service";
import { getProjectSupplierReport } from "../reports/project-supplier-report.service";
import type { SubcontractReportFilters } from "../reports/subcontract-variance.service";
import { getSubcontractVarianceReport } from "../reports/subcontract-variance.service";
import type { MaterialReportFilters } from "../reports/material-variance.service";
import { getMaterialVarianceReport } from "../reports/material-variance.service";
import type { ResourceVarianceFilters } from "../resources/resource-variance.service";
import { getResourceVarianceReport } from "../resources/resource-variance.service";
import {
  RESOURCE_BOARD_LABELS_ES,
  RESOURCE_BOARD_ROUTE_SEGMENT,
  type ResourceBoardCategory,
} from "../resources/resource-board-pure";
import type { ProjectCashFlowFilters } from "../project-cash-flow/project-cash-flow.service";
import { getProjectCashFlowReport } from "../project-cash-flow/project-cash-flow.service";
import type { IncomeExpenseFilters } from "../reports/project-income-expense.service";
import { getProjectIncomeExpenseReport } from "../reports/project-income-expense.service";
import type { ProfitabilityFilters } from "../reports/project-profitability.service";
import { getProjectProfitabilityReport } from "../reports/project-profitability.service";
import type { ProjectGgOverviewFilters } from "../reports/project-gg-overview.service";
import { getProjectGgOverviewReport } from "../reports/project-gg-overview.service";
import { parseCurrencyView } from "../reports/report-currency-view";
import { MAX_EXPORT_ROWS } from "../finance/pagination";
import { listCompanyPayables, type CompanyPayableListFilters } from "../ap/payable.service";
import {
  type CompanySupplierInvoiceListFilters,
} from "../ap/supplier-invoice.service";
import { ServiceContext, ServiceError } from "../types";
import { buildCsv, parseBuiltCsv } from "./csv-export.service";
import { safeReportFilename } from "./filename.service";
import { buildXlsxSheet } from "./xlsx-export.service";
import { readCompanySupplierInvoicesForExport } from "./operational-list-export.service";
import {
  TREASURY_MOVEMENTS_EXPORT_LABELS,
  type MovementExportLabels,
  type ReportCsvPayload,
  type ReportXlsxPayload,
} from "./report-export.types";

function tableToXlsx(
  headers: string[],
  rows: string[][],
  filenameBase: string,
  sheetName: string,
): ReportXlsxPayload {
  return {
    buffer: buildXlsxSheet(headers, rows, { sheetName }),
    filename: safeReportFilename(filenameBase, "xlsx"),
  };
}

function csvTextToXlsx(
  content: string,
  filenameBase: string,
  sheetName: string,
): ReportXlsxPayload {
  const { headers, rows } = parseBuiltCsv(content);
  return tableToXlsx(headers, rows, filenameBase, sheetName);
}

function padCsvRow(cells: string[], columnCount: number): string[] {
  const r = [...cells];
  while (r.length < columnCount) r.push("");
  return r.slice(0, columnCount);
}

// â”€â”€â”€ Parsers (query strings from routes; same semantics as App Router pages) â”€â”€â”€

export function parseAgingFilters(sp: Record<string, string | undefined>): AgingFilters {
  const bucket = sp.bucket as AgingBucket | undefined;
  const valid: AgingBucket[] = ["current", "1_30", "31_60", "61_90", "90_plus"];
  return {
    search: sp.search,
    currency: sp.currency,
    bucket: bucket && valid.includes(bucket) ? bucket : undefined,
    asOfDate: sp.asOfDate,
    projectId: sp.projectId,
    corporateOnly: sp.scope === "corporate",
    contactId: sp.contactId,
    companyId: sp.companyId,
    includePaid: sp.includePaid === "true",
  };
}

export function parseCashPositionFilters(
  sp: Record<string, string | undefined>,
): CashPositionFilters {
  return {
    companyId: sp.companyId,
    currency: sp.currency,
  };
}

export function parseMovementReportFilters(
  sp: Record<string, string | undefined>,
): MovementReportFilters {
  const scope = sp.scope;
  return {
    accountId: sp.accountId,
    companyId: sp.companyId,
    dateFrom: sp.dateFrom,
    dateTo: sp.dateTo,
    type: sp.type,
    sourceType: sp.sourceType,
    currency: sp.currency,
    includeInternalTransfers: sp.includeInternalTransfers === "false" ? false : true,
    corporateApPaymentsOnly: sp.corporateApPayments === "true",
    projectId: sp.projectId,
    corporateOnly: scope === "corporate" || sp.corporateOnly === "true",
    projectOnly: scope === "project" || sp.projectOnly === "true",
    class: sp.class,
    sortDir: sp.dir === "asc" ? "asc" : sp.dir === "desc" ? "desc" : undefined,
    dateBasis: sp.dateBasis === "value" ? "value" : "accounting",
  };
}

const PAYABLE_EXPORT_STATUSES = ["OPEN", "PARTIAL", "PAID", "OVERDUE", "CANCELLED"] as const;
const INVOICE_EXPORT_STATUSES = ["DRAFT", "ISSUED", "CANCELLED"] as const;

export function parseCompanyPayableExportFilters(
  sp: Record<string, string | undefined>,
): CompanyPayableListFilters {
  const showAll = sp.status === "ALL";
  const status =
    sp.status && !showAll && (PAYABLE_EXPORT_STATUSES as readonly string[]).includes(sp.status)
      ? (sp.status as (typeof PAYABLE_EXPORT_STATUSES)[number])
      : undefined;
  const dueDateFrom = sp.from ?? sp.dueDateFrom;
  const dueDateTo = sp.to ?? sp.dueDateTo;
  return {
    status,
    pendingOnly: !showAll && !status,
    ...(dueDateFrom ? { dueDateFrom } : {}),
    ...(dueDateTo ? { dueDateTo } : {}),
  };
}

export function parseCompanySupplierInvoiceExportFilters(
  sp: Record<string, string | undefined>,
): CompanySupplierInvoiceListFilters {
  const showAll = sp.status === "ALL";
  const activeOnly = sp.status === "ACTIVE";
  const status =
    sp.status &&
    !showAll &&
    !activeOnly &&
    (INVOICE_EXPORT_STATUSES as readonly string[]).includes(sp.status)
      ? (sp.status as (typeof INVOICE_EXPORT_STATUSES)[number])
      : undefined;
  const issueDateFrom = sp.from ?? sp.issueDateFrom;
  const issueDateTo = sp.to ?? sp.issueDateTo;
  return {
    ...(showAll ? { includeCancelled: true } : activeOnly ? {} : { status: status ?? "ISSUED" }),
    ...(issueDateFrom ? { issueDateFrom } : {}),
    ...(issueDateTo ? { issueDateTo } : {}),
    ...(sp.class ? { class: sp.class } : {}),
    ...(sp.kind === "INVOICE" || sp.kind === "CREDIT_NOTE" || sp.kind === "DEBIT_NOTE"
      ? { documentKind: sp.kind }
      : {}),
  };
}

export function parseCashFlowFilters(sp: Record<string, string | undefined>): CashFlowFilters {
  const period =
    sp.period === "day" || sp.period === "week" || sp.period === "month" ? sp.period : undefined;
  return {
    dateFrom: sp.dateFrom,
    dateTo: sp.dateTo,
    period,
    currency: sp.currency,
  };
}

export function parseStockBalanceFilters(
  sp: Record<string, string | undefined>,
): StockBalanceFilters {
  return {
    warehouseId: sp.warehouseId,
    productId: sp.productId,
    companyId: sp.companyId,
    projectId: sp.projectId,
    includeZeroStock: sp.includeZeroStock === "true",
  };
}

export function parseStockMovementFilters(
  sp: Record<string, string | undefined>,
): StockMovementReportFilters {
  return {
    warehouseId: sp.warehouseId,
    productId: sp.productId,
    projectId: sp.projectId,
    wbsNodeId: sp.wbsNodeId,
    companyId: sp.companyId,
    sourceType: sp.sourceType,
    movementType: sp.movementType,
    dateFrom: sp.dateFrom,
    dateTo: sp.dateTo,
  };
}

export function parseCostControlFilters(
  sp: Record<string, string | undefined>,
): CostControlFilters {
  return {
    budgetId: sp.budgetId,
    dateFrom: sp.dateFrom,
    dateTo: sp.dateTo,
    wbsSearch: sp.wbsSearch,
    costType: parseCostCategoryFilter(sp.costType),
  };
}

export function parseBudgetVarianceFilters(
  sp: Record<string, string | undefined>,
): BudgetVarianceFilters {
  return {
    ...parseCostControlFilters(sp),
    costLayer: parseCostVarianceLayer(sp.costLayer),
  };
}

export function parseCertificationReportFilters(
  sp: Record<string, string | undefined>,
): CertificationReportFilters {
  return parseProjectReportDateFilters(sp);
}

export function parseProjectReportDateFilters(sp: Record<string, string | undefined>) {
  return {
    budgetId: sp.budgetId,
    dateFrom: sp.dateFrom,
    dateTo: sp.dateTo,
  };
}

/** Aligns with project report pages (`ingresos-gastos`, scheduled params). */
export function parseIncomeExpenseFilters(
  sp: Record<string, string | undefined>,
): IncomeExpenseFilters {
  const currencyViewRaw =
    sp.currencyView === "original" || sp.currencyView === "ARS"
      ? sp.currencyView
      : sp.currency === "original" || sp.currency === "ARS"
        ? sp.currency
        : undefined;
  return {
    ...parseProjectReportDateFilters(sp),
    currencyView: parseCurrencyView(currencyViewRaw),
  };
}

/** Aligns with `rentabilidad` report routes and CSV export. */
export function parseProfitabilityFilters(
  sp: Record<string, string | undefined>,
): ProfitabilityFilters {
  return {
    budgetId: sp.budgetId,
    costLayer: parseCostVarianceLayer(sp.costLayer),
    revenueBasis: sp.revenueBasis === "invoiced" ? "invoiced" : "certified",
    currencyView: parseCurrencyView(sp.currencyView),
  };
}

export function parseProcurementReportFilters(
  sp: Record<string, string | undefined>,
): ProcurementReportFilters {
  return parseProjectReportDateFilters(sp);
}

export function parseProjectSupplierReportFilters(
  sp: Record<string, string | undefined>,
): ProjectSupplierReportFilters {
  return {
    dateFrom: sp.dateFrom,
    dateTo: sp.dateTo,
    currency: sp.currency,
  };
}

export function parseSubcontractReportFilters(
  sp: Record<string, string | undefined>,
): SubcontractReportFilters {
  return parseProjectReportDateFilters(sp);
}

export function parseProjectCashFlowFilters(
  sp: Record<string, string | undefined>,
): ProjectCashFlowFilters {
  const period =
    sp.period === "day" || sp.period === "week" || sp.period === "month" ? sp.period : undefined;
  return {
    dateFrom: sp.dateFrom,
    dateTo: sp.dateTo,
    period,
    currency: sp.currency,
  };
}

// â”€â”€â”€ CSV builders â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function exportReceivableAgingCsv(
  filters: AgingFilters,
  ctx: ServiceContext,
): Promise<ReportCsvPayload> {
  const report = await getReceivableAgingReport(filters, ctx);
  const headers = [
    "Cliente",
    "Moneda",
    "NroFactura",
    "Proyecto",
    "FechaEmision",
    "FechaVencimiento",
    "DiasVencido",
    "MontoOriginal",
    "MontoPagado",
    "MontoAcreditado",
    "SaldoActual",
    "Estado",
    "Bucket",
    "FechaReferenciaVencimientos",
  ];
  const rows: string[][] = [];
  for (const g of report.rows) {
    for (const it of g.items) {
      rows.push([
        g.contactName,
        g.currency,
        String(it.invoiceNumber),
        it.projectName,
        it.issueDate,
        it.dueDate,
        String(it.daysOverdue),
        it.originalAmount,
        it.paidAmount,
        it.creditedAmount,
        it.balanceDue,
        it.status,
        it.bucket,
        report.asOfDate,
      ]);
    }
  }
  return {
    content: buildCsv(headers, rows),
    filename: safeReportFilename(`aging_cxc_${report.asOfDate}`, "csv"),
  };
}

export async function exportPayableAgingCsv(
  filters: AgingFilters,
  ctx: ServiceContext,
): Promise<ReportCsvPayload> {
  const report = await getPayableAgingReport(filters, ctx);
  const headers = [
    "Proveedor",
    "Moneda",
    "NroFactura",
    "Proyecto",
    "FechaEmision",
    "FechaVencimiento",
    "DiasVencido",
    "MontoOriginal",
    "MontoPagado",
    "MontoAcreditado",
    "SaldoActual",
    "Estado",
    "Bucket",
    "FechaReferenciaVencimientos",
  ];
  const rows: string[][] = [];
  for (const g of report.rows) {
    for (const it of g.items) {
      rows.push([
        g.contactName,
        g.currency,
        String(it.invoiceNumber),
        it.projectName,
        it.issueDate,
        it.dueDate,
        String(it.daysOverdue),
        it.originalAmount,
        it.paidAmount,
        it.creditedAmount,
        it.balanceDue,
        it.status,
        it.bucket,
        report.asOfDate,
      ]);
    }
  }
  return {
    content: buildCsv(headers, rows),
    filename: safeReportFilename(`aging_cxp_${report.asOfDate}`, "csv"),
  };
}

export async function exportCashPositionCsv(
  filters: CashPositionFilters,
  ctx: ServiceContext,
): Promise<ReportCsvPayload> {
  const report = await getCashPositionReport(filters, ctx);
  const headers = ["Empresa", "Cuenta", "TipoCuenta", "Moneda", "Estado", "Saldo", "SaldoEquivalenteHistoricoARS", "TotalEquivalenteHistoricoARS", "EstadoConsolidadoARS"];
  const rows = report.accounts.map((a, index) => [
    a.companyName ?? "",
    a.name,
    a.type,
    a.currency,
    a.status,
    a.balance,
    a.balanceArs ?? "",
    index === 0 ? report.consolidatedArs ?? "" : "",
    index === 0 ? (report.consolidatedArs === null ? "Incompleto" : "Disponible") : "",
  ]);
  return {
    content: buildCsv(headers, rows),
    filename: safeReportFilename("tesoreria_posicion_caja", "csv"),
  };
}

export async function exportTreasuryMovementsCsv(
  filters: MovementReportFilters,
  ctx: ServiceContext,
  labels: MovementExportLabels = TREASURY_MOVEMENTS_EXPORT_LABELS,
): Promise<ReportCsvPayload> {
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
  const headers = [
    "Fecha",
    "Cuenta",
    "Tipo",
    "Clase",
    "Origen",
    "EtiquetaOrigen",
    "Proyecto",
    "ComprobanteExterno",
    "Importe",
    "ImporteSignado",
    "Moneda",
    "Descripcion",
    "TransferenciaInterna",
    "SaldoAcumulado",
    "FacturaInterna",
    "TipoCambioARS",
    "ImporteEquivalenteHistoricoARS",
    "FechaContable",
    "FechaValor",
    "CriterioFecha",
  ];
  const data = rows.map((r) => [
    filters.dateBasis === "value" ? r.valueDate ?? r.movementDate : r.movementDate,
    r.accountName,
    r.type,
    r.classLabel,
    r.sourceType,
    r.sourceLabel,
    r.projectName ?? (r.projectId ? r.projectId : "Empresa"),
    r.externalInvoiceRef ?? "",
    r.amount,
    r.signedAmount,
    r.currency,
    r.description,
    r.isInternalTransfer ? "Si" : "No",
    r.runningBalance ?? "",
    r.documentRef ?? "",
    r.fxRate ?? "",
    r.amountArs ?? "",
    r.movementDate,
    r.valueDate ?? "",
    filters.dateBasis === "value" ? "Valor" : "Contable",
  ]);
  return {
    content: buildCsv(headers, data),
    filename: safeReportFilename(labels.filenameBase, "csv"),
  };
}

export async function exportCompanyPayablesCsv(
  filters: CompanyPayableListFilters,
  ctx: ServiceContext,
): Promise<ReportCsvPayload> {
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
  const headers = [
    "Proveedor",
    "Factura",
    "Vencimiento",
    "Estado",
    "Moneda",
    "Original",
    "Pagado",
    "Saldo",
  ];
  const rows = data.map((p) => [
    p.supplierName,
    p.supplierInvoiceCode ?? "",
    p.dueDate instanceof Date
      ? p.dueDate.toISOString().slice(0, 10)
      : String(p.dueDate).slice(0, 10),
    p.status,
    p.currency,
    p.originalAmount,
    p.paidAmount,
    p.balanceDue,
  ]);
  return {
    content: buildCsv(headers, rows),
    filename: safeReportFilename("finanzas_cxp_corporativo", "csv"),
  };
}

export async function exportCompanySupplierInvoicesCsv(
  filters: CompanySupplierInvoiceListFilters,
  ctx: ServiceContext,
): Promise<ReportCsvPayload> {
  const data = await readCompanySupplierInvoicesForExport(filters, ctx);
  const headers = [
    "Codigo",
    "Tipo",
    "Proveedor",
    "Clase",
    "Emision",
    "Vencimiento",
    "Estado",
    "Moneda",
    "Total",
  ];
  const rows = data.map((inv) => [
    inv.code,
    inv.documentKind === "CREDIT_NOTE"
      ? "Nota de credito"
      : inv.documentKind === "DEBIT_NOTE"
        ? "Nota de debito"
        : "Factura",
    inv.supplierName,
    inv.classLabel,
    inv.issueDate instanceof Date
      ? inv.issueDate.toISOString().slice(0, 10)
      : String(inv.issueDate).slice(0, 10),
    inv.dueDate instanceof Date
      ? inv.dueDate.toISOString().slice(0, 10)
      : String(inv.dueDate).slice(0, 10),
    inv.status,
    inv.currency,
    inv.totalAmount,
  ]);
  return {
    content: buildCsv(headers, rows),
    filename: safeReportFilename("finanzas_facturas_proveedor_corporativo", "csv"),
  };
}

export async function exportCompanySupplierInvoicesXlsx(
  filters: CompanySupplierInvoiceListFilters,
  ctx: ServiceContext,
): Promise<ReportXlsxPayload> {
  const { content, filename } = await exportCompanySupplierInvoicesCsv(filters, ctx);
  return csvTextToXlsx(content, filename.replace(/\.csv$/i, ""), "Facturas y gastos");
}

export async function exportTreasuryCashFlowCsv(
  filters: CashFlowFilters,
  ctx: ServiceContext,
): Promise<ReportCsvPayload> {
  const report = await getCashFlowReport(filters, ctx);
  const headers = [
    "Moneda",
    "TipoFila",
    "Referencia",
    "Ingresos",
    "Egresos",
    "TransfEntrada",
    "TransfSalida",
    "Ajustes",
    "FlujoNetoOperativo",
    "FlujoNeto",
    "Saldo",
  ];
  const rows: string[][] = [];
  for (const cur of report) {
    rows.push([cur.currency, "APERTURA", "", "", "", "", "", "", "", "", cur.openingBalance]);
    for (const b of cur.buckets) {
      rows.push([
        cur.currency,
        "PERIODO",
        b.period,
        b.inflow,
        b.outflow,
        b.internalTransferIn,
        b.internalTransferOut,
        b.adjustments,
        b.netOperatingCashFlow,
        b.netCashFlow,
        "",
      ]);
    }
    rows.push([cur.currency, "CIERRE", "", "", "", "", "", "", "", "", cur.closingBalance]);
  }
  return {
    content: buildCsv(headers, rows),
    filename: safeReportFilename("tesoreria_flujo_caja", "csv"),
  };
}

export async function exportStockBalanceCsv(
  filters: StockBalanceFilters,
  ctx: ServiceContext,
): Promise<ReportCsvPayload> {
  const data = await getStockBalanceReport(filters, ctx);
  const headers = [
    "SKU",
    "Producto",
    "Unidad",
    "Deposito",
    "Empresa",
    "Proyecto",
    "Cantidad",
    "UltimoMovimiento",
    "StockCero",
    "StockNegativo",
    "AjustePendiente",
  ];
  const rows = data.map((r) => [
    r.productSku,
    r.productName,
    r.productUnit,
    r.warehouseName,
    r.companyName,
    r.projectName ?? "",
    r.quantityOnHand,
    r.lastMovementDate ?? "",
    r.flags.zeroStock ? "Si" : "No",
    r.flags.negativeStock ? "Si" : "No",
    r.flags.adjustmentPresent ? "Si" : "No",
  ]);
  return {
    content: buildCsv(headers, rows),
    filename: safeReportFilename("inventario_stock", "csv"),
  };
}

export async function exportStockMovementsCsv(
  filters: StockMovementReportFilters,
  ctx: ServiceContext,
): Promise<ReportCsvPayload> {
  const data = await getStockMovementReport(filters, ctx);
  const headers = [
    "Fecha",
    "SKU",
    "Producto",
    "Unidad",
    "Deposito",
    "Proyecto",
    "EDT",
    "Tipo",
    "Origen",
    "EtiquetaOrigen",
    "Cantidad",
    "CantidadSignada",
    "CostoUnitario",
    "CostoTotal",
    "MonedaCosto",
    "AdvertenciaCosto",
    "Notas",
  ];
  const rows = data.map((r) => [
    r.movementDate,
    r.productSku,
    r.productName,
    r.productUnit,
    r.warehouseName,
    r.projectName ?? "",
    r.wbsNodeName ?? "",
    r.type,
    r.sourceType,
    r.sourceLabel,
    r.quantity,
    r.signedQuantity ?? "",
    r.unitCost ?? "",
    r.totalCost ?? "",
    r.costCurrency ?? "",
    r.costWarning ?? "",
    r.notes ?? "",
  ]);
  return {
    content: buildCsv(headers, rows),
    filename: safeReportFilename("inventario_movimientos", "csv"),
  };
}

export async function exportProjectCostControlCsv(
  projectId: string,
  filters: CostControlFilters,
  ctx: ServiceContext,
): Promise<ReportCsvPayload> {
  const result = await getProjectCostControl(projectId, filters, ctx);
  if (result.type === "NO_APPROVED_BUDGETS") {
    throw new ServiceError(
      "CONFLICT",
      "No hay presupuesto aprobado o cerrado para exportar el control de costos",
    );
  }
  if (result.type === "BUDGET_SELECTION_REQUIRED") {
    throw new ServiceError(
      "CONFLICT",
      "Seleccioná un presupuesto para exportar el control de costos",
    );
  }
  const r = filters.costType ? sliceCostControlReportByCostType(result, filters.costType) : result;
  const headers = [
    "CodigoWBS",
    "NombreWBS",
    "Unidad",
    "PresupCantidad",
    "PresupCostoUnit",
    "PresupCostoTotal",
    "PresupVentaUnit",
    "PresupVentaTotal",
    "CertificadoEmitido",
    "CertificadoAprobado",
    "CostoComprometido",
    "CostoRecibido",
    "CostoDevengado",
    "CostoPagado",
    "ConsumoInventario",
    "CantComprometida",
    "CantRecibida",
    "CantConsumida",
    "PctCompra",
    "PctRecepcion",
    "PctAvanceLibro",
    "PctEconomico",
    "PctExposicion",
    "AvanceOperativoQty",
    "AvanceEnviadoQty",
    "ComprometidoAbierto",
    "ExposicionEsperada",
    "PresupuestoRestante",
    "VariacionCosto",
    "MargenProyectado",
    "SobrePresupuesto",
    "SobreCertificado",
    "SinPresupuesto",
  ];
  const rows = r.rows.map((x) => [
    x.wbsCode,
    x.wbsName,
    x.unit,
    x.budgetQty,
    x.budgetUnitCost,
    x.budgetTotalCost,
    x.budgetUnitSale,
    x.budgetTotalSale,
    x.certifiedIssued,
    x.certifiedApproved,
    x.committedCost,
    x.receivedCost,
    x.accruedCost,
    x.paidCost,
    x.inventoryConsumedCost ?? "",
    x.qtyCommitted ?? "",
    x.qtyReceived ?? "",
    x.qtyConsumed ?? "",
    x.pctPurchased ?? "",
    x.pctReceived ?? "",
    x.pctPhysicalProgress ?? "",
    x.pctEconomic ?? "",
    x.pctExposure ?? "",
    x.operationalProgressQty,
    x.submittedProgressQty,
    x.openCommittedCost,
    x.expectedCostExposure,
    x.remainingBudgetCost,
    x.costVariance,
    x.projectedMargin,
    x.flags.overBudget ? "Si" : "No",
    x.flags.overCertified ? "Si" : "No",
    x.flags.missingBudget ? "Si" : "No",
  ]);
  rows.push([
    "__TOTALES__",
    "Totales",
    "",
    "",
    "",
    r.totals.budgetTotalCost,
    "",
    r.totals.budgetTotalSale,
    r.totals.certifiedIssued,
    r.totals.certifiedApproved,
    r.totals.committedCost,
    r.totals.receivedCost,
    r.totals.accruedCost,
    r.totals.paidCost,
    r.totals.inventoryConsumedCost ?? "",
    "", // qtyCommitted
    "", // qtyReceived
    "", // qtyConsumed
    "", // pctPurchased
    "", // pctReceived
    "", // pctPhysicalProgress
    "", // pctEconomic
    "", // pctExposure
    r.totals.operationalProgressQty,
    "",
    r.totals.openCommittedCost,
    r.totals.expectedCostExposure,
    r.totals.remainingBudgetCost,
    r.totals.costVariance,
    r.totals.projectedMargin,
    "",
    "",
    "",
  ]);
  rows.push(
    padCsvRow(
      [
        "__NO_ASIGNADO__",
        "Costos no asignados a EDT",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        r.unallocatedCommittedCost,
        r.unallocatedReceivedCost,
        r.unallocatedAccruedCost,
        r.unallocatedPaidCost,
        r.unallocatedInventoryConsumedCost ?? "",
      ],
      headers.length,
    ),
  );

  if (r.sectionsExcluded.length > 0) {
    const n = headers.length;
    rows.push(
      padCsvRow(
        [
          "__AVISOS_TENANT__",
          "Reporte parcial: capas omitidas por modulo deshabilitado para el tenant",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
        ],
        n,
      ),
    );
    rows.push(
      padCsvRow(
        [
          "Modulo",
          "Seccion",
          "Razon",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
        ],
        n,
      ),
    );
    for (const ex of r.sectionsExcluded) {
      rows.push(
        padCsvRow(
          [
            ex.module,
            ex.section,
            ex.reason,
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
          ],
          n,
        ),
      );
    }
  }

  for (const warning of r.warnings) {
    rows.push(padCsvRow(["__AVISO__", warning], headers.length));
  }
  const typeSuffix = filters.costType ? `_${filters.costType.toLowerCase()}` : "";
  const fname = `control_costos_${r.projectId}_${r.budgetName.replace(/[^a-zA-Z0-9._-]+/g, "_")}${typeSuffix}`;
  return {
    content: buildCsv(
      [...headers, "Moneda"],
      rows.map((row) => [...row, r.currency]),
    ),
    filename: safeReportFilename(fname, "csv"),
  };
}

const LAYER_CSV_LABEL: Record<string, string> = {
  exposure: "ExposicionEsperada",
  committed: "Comprometido",
  accrued: "Devengado",
  paid: "Pagado",
};

export async function exportBudgetVarianceCsv(
  projectId: string,
  filters: BudgetVarianceFilters,
  ctx: ServiceContext,
): Promise<ReportCsvPayload> {
  const result = await getBudgetVarianceReport(projectId, filters, ctx);
  if (result.type === "NO_APPROVED_BUDGETS") {
    throw new ServiceError("CONFLICT", "No hay presupuesto aprobado o cerrado para exportar");
  }
  if (result.type === "BUDGET_SELECTION_REQUIRED") {
    throw new ServiceError("CONFLICT", "Seleccioná un presupuesto para exportar");
  }
  const r = result;
  const actualCol = `Real_${LAYER_CSV_LABEL[r.costLayer] ?? r.costLayer}`;
  const headers = [
    "CodigoWBS",
    "NombreWBS",
    "Unidad",
    "PresupCostoTotal",
    "PresupVentaTotal",
    actualCol,
    "VariacionMonto",
    "VariacionPct",
    "EstadoVariacion",
    "CostoComprometido",
    "CostoDevengado",
    "CostoPagado",
    "ExposicionEsperada",
    "CertificadoAprobado",
    "MargenProyectado",
    "SobrePresupuesto",
  ];
  const rows = r.rows.map((x) => [
    x.wbsCode,
    x.wbsName,
    x.unit,
    x.budgetTotalCost,
    x.budgetTotalSale,
    x.actualCost,
    x.costVariance,
    x.variancePct ?? "",
    x.varianceStatus,
    x.committedCost,
    x.accruedCost,
    x.paidCost,
    x.expectedCostExposure,
    x.certifiedApproved,
    x.projectedMargin,
    x.flags.overBudget ? "Si" : "No",
  ]);
  rows.push([
    "__TOTALES__",
    "Totales",
    "",
    r.totals.budgetTotalCost,
    r.totals.budgetTotalSale,
    r.totals.actualCost,
    r.totals.costVariance,
    r.totals.variancePct ?? "",
    "",
    r.totals.committedCost,
    r.totals.accruedCost,
    r.totals.paidCost,
    r.totals.expectedCostExposure,
    r.totals.certifiedApproved,
    r.totals.projectedMargin,
    "",
  ]);
  const fname = `presupuesto_vs_real_${r.projectId}_${r.budgetName.replace(/[^a-zA-Z0-9._-]+/g, "_")}`;
  return {
    content: buildCsv(headers, rows),
    filename: safeReportFilename(fname, "csv"),
  };
}

export async function exportCertificationEvolutionCsv(
  projectId: string,
  filters: CertificationReportFilters,
  ctx: ServiceContext,
): Promise<ReportCsvPayload> {
  const result = await getCertificationEvolutionReport(projectId, filters, ctx);
  if (result.type === "NO_APPROVED_BUDGETS") {
    throw new ServiceError("CONFLICT", "No hay presupuesto aprobado para exportar certificaciones");
  }
  const headers = [
    "Tipo",
    "Codigo",
    "PeriodoInicio",
    "PeriodoFin",
    "Estado",
    "MontoCertificado",
    "MontoFacturado",
    "MontoCobrado",
    "EstadoCobranza",
    "VentaPresupuestada",
    "CertificadoAcum",
    "PctCertificado",
    "PendienteCertificar",
  ];
  const rows: string[][] = [];

  for (const p of result.portfolio) {
    rows.push([
      "CERTIFICACION",
      p.code,
      p.periodStart,
      p.periodEnd,
      p.status,
      p.totalAmount,
      p.invoicedAmount ?? "",
      p.collectedAmount ?? "",
      p.paymentStatus ?? "",
      "",
      "",
      "",
      "",
    ]);
  }

  for (const v of result.vsBudget) {
    rows.push([
      "PARTIDA",
      v.wbsCode,
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      v.budgetSale,
      v.certifiedCumulative,
      v.certifiedPct ?? "",
      v.pendingCertify,
    ]);
  }

  for (const m of result.monthlySeries) {
    rows.push([
      "MES",
      m.periodKey,
      "",
      "",
      "",
      m.certifiedAmount,
      m.invoicedAmount ?? "",
      m.collectedAmount ?? "",
      "",
      "",
      "",
      "",
      "",
    ]);
  }

  const fname = `certificaciones_${projectId}_${result.budgetName.replace(/[^a-zA-Z0-9._-]+/g, "_")}`;
  const progressByPeriod = new Map(result.progressSeries.map((point) => [point.periodKey, point]));
  return {
    content: buildCsv(
      [...headers, "Moneda", "ARDisponible", "AvanceEconomicoPct", "AvanceFisicoPct", "AvanceFinancieroPct"],
      rows.map((row) => {
        const progress = row[0] === "MES" ? progressByPeriod.get(row[1] ?? "") : undefined;
        return [
          ...row,
          result.currency,
          result.arAvailable ? "Sí" : "No",
          progress?.economicPct ?? "",
          progress?.physicalPct ?? "",
          progress?.financialPct ?? "",
        ];
      }),
    ),
    filename: safeReportFilename(fname, "csv"),
  };
}

export async function exportProcurementDeviationCsv(
  projectId: string,
  filters: ProcurementReportFilters,
  ctx: ServiceContext,
): Promise<ReportCsvPayload> {
  const result = await getProcurementDeviationReport(projectId, filters, ctx);
  if (result.type === "NO_APPROVED_BUDGETS") {
    throw new ServiceError("CONFLICT", "No hay presupuesto aprobado para exportar compras");
  }
  const poVariance = await getPurchaseOrderVarianceReport(projectId, ctx, filters);
  const headers = [
    "Tipo",
    "Codigo",
    "Nombre",
    "Proveedor",
    "PresupuestoMaterial",
    "Comprometido",
    "Devengado",
    "Variacion",
    "VariacionPct",
    "ImporteSinImputacion",
    "Pagado",
    "ComprometidoAbierto",
    "Moneda",
    "EstadoOC",
    "PartidaEDT",
    "Unidad",
    "PrecioUnitarioOC",
    "DescuentoPctOC",
    "CostoUnitarioReferencia",
    "MotivoDesvio",
    "Justificacion",
  ];
  const rows: string[][] = result.byWbs.map((r) => [
    "PARTIDA",
    r.wbsCode,
    r.wbsName,
    "",
    r.budgetMaterial,
    r.committedCost,
    result.apAvailable ? r.accruedCost : "",
    r.varianceAmount,
    r.variancePct ?? "",
    "",
    "",
    "",
    result.currency,
  ]);
  for (const u of result.unallocated) {
    rows.push([
      u.documentType,
      u.documentCode,
      u.description,
      u.supplierName,
      "",
      "",
      "",
      "",
      "",
      u.amount,
      "",
      "",
      result.currency,
    ]);
  }
  for (const s of result.bySupplier) {
    rows.push([
      "PROVEEDOR",
      "",
      "",
      s.supplierName,
      "",
      s.committedCost,
      result.apAvailable ? s.accruedCost : "",
      "",
      "",
      "",
      result.apAvailable ? s.paidCost : "",
      result.apAvailable ? s.openCommitted : "",
      result.currency,
    ]);
  }
  for (const row of poVariance.rows) {
    rows.push([
      "DESVIO_OC", row.purchaseOrderCode, row.description, "", "", "", "", "",
      row.variancePct ?? "", "", "", "", row.currency,
      row.purchaseOrderStatus, row.wbsCode ?? "", row.unit, row.unitPrice, row.discountPct,
      row.budgetUnitCostSnapshot ?? "", row.varianceTier, row.varianceJustification ?? "",
    ]);
  }
  for (const warning of result.warnings) rows.push(["__AVISO__", "", warning]);
  const fname = `compras_${projectId}_${result.budgetName.replace(/[^a-zA-Z0-9._-]+/g, "_")}`;
  return {
    content: buildCsv(headers, rows.map((row) => padCsvRow(row, headers.length))),
    filename: safeReportFilename(fname, "csv"),
  };
}

export async function exportProjectSupplierReportCsv(
  projectId: string,
  filters: ProjectSupplierReportFilters,
  ctx: ServiceContext,
): Promise<ReportCsvPayload> {
  const result = await getProjectSupplierReport(projectId, filters, ctx);
  const { apAvailable } = result;
  const headers = [
    "Proveedor",
    "PedidosOC",
    "OCAbiertas",
    "Facturas",
    "Recepciones",
    "Comprometido",
    "Devengado",
    "Pagado",
    "OCAbiertaMonto",
    "Exposicion",
    "ParticipacionPct",
    "SaldoCxp",
    "CxpVencido",
    "UltimaActividad",
    "Moneda",
    "APDisponible",
  ];
  const rows: string[][] = result.rows.map((s) => [
    s.supplierName,
    String(s.poCount),
    String(s.openPoCount),
    apAvailable ? String(s.invoiceCount) : "",
    String(s.receiptCount),
    s.committedCost,
    apAvailable ? s.accruedCost : "",
    apAvailable ? s.paidCost : "",
    apAvailable ? s.openCommitted : "",
    apAvailable ? s.expectedExposure : "",
    apAvailable ? s.shareOfExposurePct ?? "" : "",
    apAvailable ? s.payableBalance : "",
    apAvailable ? s.overduePayable : "",
    s.lastActivityDate ?? "",
    result.currency,
    apAvailable ? "Sí" : "No",
  ]);
  rows.push([
    "TOTAL",
    String(result.totals.poCount),
    "",
    apAvailable ? String(result.totals.invoiceCount) : "",
    String(result.totals.receiptCount),
    result.totals.committedCost,
    apAvailable ? result.totals.accruedCost : "",
    apAvailable ? result.totals.paidCost : "",
    apAvailable ? result.totals.openCommitted : "",
    apAvailable ? result.totals.expectedExposure : "",
    apAvailable && result.totals.top3SharePct ? "100.00" : "",
    apAvailable ? result.totals.payableBalance : "",
    apAvailable ? result.totals.overduePayable : "",
    "",
    result.currency,
    apAvailable ? "Sí" : "No",
  ]);
  return {
    content: buildCsv(headers, rows),
    filename: safeReportFilename(`proveedores_${projectId}`, "csv"),
  };
}

export async function exportSubcontractVarianceCsv(
  projectId: string,
  filters: SubcontractReportFilters,
  ctx: ServiceContext,
): Promise<ReportCsvPayload> {
  const result = await getSubcontractVarianceReport(projectId, filters, ctx);
  if (result.type === "NO_APPROVED_BUDGETS") {
    throw new ServiceError("CONFLICT", "No hay presupuesto aprobado para exportar subcontratos");
  }
  const headers = [
    "Tipo",
    "Codigo",
    "Nombre",
    "PresupuestoSub",
    "Contratado",
    "Certificado",
    "Variacion",
    "Estado",
    "Pagado",
  ];
  const rows: string[][] = result.byWbs.map((r) => [
    "PARTIDA",
    r.wbsCode,
    r.wbsName,
    r.budgetSubcontract,
    r.committedCost,
    r.certifiedCost,
    r.varianceCommitted,
    r.status,
    "",
  ]);
  for (const c of result.contracts) {
    rows.push([
      "CONTRATO",
      c.code,
      `${c.title} â€” ${c.subcontractorName}`,
      "",
      c.totalValue,
      c.certifiedCost,
      "",
      c.status,
      "",
    ]);
  }
  for (const point of result.monthlyCertification) {
    rows.push(["MES", point.periodKey, point.periodLabel, "", "", point.certifiedAmount, "", "", result.apAvailable ? point.paidAmount : ""]);
  }
  for (const warning of result.warnings) rows.push(padCsvRow(["__AVISO__", "", warning], headers.length));
  const fname = `subcontratos_${projectId}_${result.budgetName.replace(/[^a-zA-Z0-9._-]+/g, "_")}`;
  return {
    content: buildCsv([...headers, "Moneda"], rows.map((row) => [...row, result.currency])),
    filename: safeReportFilename(fname, "csv"),
  };
}

export async function exportMaterialVarianceCsv(
  projectId: string,
  filters: MaterialReportFilters,
  ctx: ServiceContext,
): Promise<ReportCsvPayload> {
  const result = await getMaterialVarianceReport(projectId, filters, ctx);
  if (result.type === "NO_APPROVED_BUDGETS") {
    throw new ServiceError("CONFLICT", "No hay presupuesto aprobado para exportar materiales");
  }
  const headers = [
    "CodigoWBS",
    "NombreWBS",
    "PresupuestoMaterial",
    "ConsumoDevengado",
    "Variacion",
    "VariacionPct",
  ];
  const rows = result.byWbs.map((r) => [
    r.wbsCode,
    r.wbsName,
    r.budgetMaterial,
    r.consumedCost ?? "",
    r.variance ?? "",
    r.variancePct ?? "",
  ]);
  rows.push([
    "TOTAL",
    "",
    result.totals.budgetMaterial,
    result.totals.consumedCost ?? "",
    result.totals.variance ?? "",
    "",
  ]);
  for (const warning of result.warnings) {
    rows.push(padCsvRow(["__AVISO__", warning], headers.length));
  }
  const fname = `materiales_${projectId}_${result.budgetName.replace(/[^a-zA-Z0-9._-]+/g, "_")}`;
  return {
    content: buildCsv(
      [...headers, "Moneda"],
      rows.map((row) => [...row, result.currency]),
    ),
    filename: safeReportFilename(fname, "csv"),
  };
}

export async function exportResourceVarianceCsv(
  projectId: string,
  costCategory: ResourceBoardCategory,
  filters: ResourceVarianceFilters,
  ctx: ServiceContext,
): Promise<ReportCsvPayload> {
  const result = await getResourceVarianceReport(projectId, costCategory, filters, ctx);
  if (result.type === "NO_APPROVED_BUDGETS") {
    throw new ServiceError(
      "CONFLICT",
      `No hay presupuesto aprobado para exportar ${RESOURCE_BOARD_LABELS_ES[costCategory].toLowerCase()}`,
    );
  }
  const headers = [
    "CodigoWBS",
    "NombreWBS",
    "Presupuesto",
    "FacturadoNeto",
    "Variacion",
    "VariacionPct",
  ];
  const rows = result.byWbs.map((r) => [
    r.wbsCode,
    r.wbsName,
    r.budgetCost,
    r.accruedCost,
    r.variance,
    r.variancePct ?? "",
  ]);
  rows.push([
    "TOTAL",
    "",
    result.totals.budgetCost,
    result.totals.accruedCost,
    result.totals.variance,
    "",
  ]);
  const segment = RESOURCE_BOARD_ROUTE_SEGMENT[costCategory];
  for (const warning of result.warnings) {
    rows.push(padCsvRow(["__AVISO__", warning], headers.length));
  }
  const fname = `${segment}_${projectId}_${result.budgetName.replace(/[^a-zA-Z0-9._-]+/g, "_")}`;
  return {
    content: buildCsv(
      [...headers, "Moneda"],
      rows.map((row) => [...row, result.currency]),
    ),
    filename: safeReportFilename(fname, "csv"),
  };
}

export async function exportProjectIncomeExpenseCsv(
  projectId: string,
  filters: IncomeExpenseFilters,
  ctx: ServiceContext,
): Promise<ReportCsvPayload> {
  const report = await getProjectIncomeExpenseReport(projectId, filters, ctx);
  const { certifications, ar, ap } = report.sourcesAvailable;
  const headers = [
    "Periodo",
    "Certificado",
    "Facturado",
    "Cobrado",
    "CostoDevengado",
    "CostoPagado",
    "MargenBrutoDevengado",
    "MargenBrutoCaja",
    "Moneda",
  ];
  const rows = report.byCurrency.flatMap(({ currency, series, totals }) =>
    [...series, { ...totals, periodLabel: "TOTAL" }].map((p) => [
      p.periodLabel,
      certifications ? p.certifiedAmount : "",
      ar ? p.invoicedAmount : "",
      ar ? p.collectedAmount : "",
      ap ? p.costAccrued : "",
      ap ? p.costPaid : "",
      p.grossMarginAccrued ?? "",
      p.grossMarginCash ?? "",
      currency,
    ]),
  );
  for (const warning of report.warnings) rows.push(padCsvRow(["__AVISO__", warning], headers.length));
  const fname = `ingresos_gastos_${projectId}_${report.dateFrom}_${report.dateTo}`;
  return { content: buildCsv(headers, rows), filename: safeReportFilename(fname, "csv") };
}

export async function exportProjectProfitabilityCsv(
  projectId: string,
  filters: ProfitabilityFilters,
  ctx: ServiceContext,
): Promise<ReportCsvPayload> {
  const report = await getProjectProfitabilityReport(projectId, filters, ctx);
  if (report.type === "NO_APPROVED_BUDGETS") {
    throw new ServiceError("CONFLICT", "No hay presupuesto aprobado para exportar rentabilidad");
  }
  const headers = ["Concepto", "Valor", "Moneda"];
  const rows: string[][] = [
    ["Presupuesto", report.budgetName, report.currency],
    ["CapaCosto", report.costLayer, ""],
    ["BaseIngresos", report.revenueBasis === "invoiced" ? "Facturado neto" : "Certificado", ""],
    ["Ingresos", report.revenue ?? "", report.currency],
    ["CostosDirectos", report.directCost ?? "", report.currency],
    ["MargenBruto", report.grossMargin ?? "", report.currency],
    ["MargenBrutoPct", report.grossMarginPct ?? "", "%"],
    ["MargenProyectado", report.projectedMargin, report.budgetCurrency],
    ["VentaPresupuestada", report.budgetTotalSale, report.budgetCurrency],
  ];
  if (report.overheadAmount != null) {
    const ggCurrency = report.overheadManualAmount != null ? report.currency : "ARS";
    rows.push(["GastosGenerales", report.overheadAmount, ggCurrency]);
    if (report.netMarginAvailable && report.netMargin != null) {
      rows.push(["MargenNeto", report.netMargin, report.currency]);
    }
  }
  if (report.byCurrency.length > 1) {
    for (const slice of report.byCurrency) {
      rows.push(
        ["IngresosPorMoneda", slice.revenue, slice.currency],
        ["CostosDirectosPorMoneda", slice.directCost ?? "", slice.currency],
        ["MargenBrutoPorMoneda", slice.grossMargin ?? "", slice.currency],
      );
    }
  }
  for (const warning of report.warnings) rows.push(["__AVISO__", warning, ""]);
  const fname = `rentabilidad_${projectId}_${report.budgetName.replace(/[^a-zA-Z0-9._-]+/g, "_")}`;
  return { content: buildCsv(headers, rows), filename: safeReportFilename(fname, "csv") };
}

export async function exportProjectGgOverviewCsv(
  projectId: string,
  filters: ProjectGgOverviewFilters,
  ctx: ServiceContext,
): Promise<ReportCsvPayload> {
  const report = await getProjectGgOverviewReport(projectId, filters, ctx);
  if (report.type === "NO_APPROVED_BUDGETS") {
    throw new ServiceError("CONFLICT", "No hay presupuesto aprobado para exportar GG de obra");
  }
  if (report.type === "BUDGET_SELECTION_REQUIRED") {
    throw new ServiceError("CONFLICT", "Elegí un presupuesto para exportar GG de obra");
  }
  const s = report.summary;
  const headers = [
    "Seccion",
    "Codigo",
    "Nombre",
    "TipoDoc",
    "Documento",
    "Proveedor",
    "Monto",
    "Moneda",
  ];
  const rows: string[][] = [
    ["Resumen", "", "Presupuesto GG", "", "", "", s.budgetedGg, report.currency],
    ["Resumen", "", "Devengado partidas GG", "", "", "", s.accruedOnGgPartidas, report.currency],
    [
      "Resumen",
      "",
      "Comprometido abierto partidas GG",
      "",
      "",
      "",
      s.openCommittedOnGgPartidas,
      report.currency,
    ],
    ["Resumen", "", "Sin EDT comprometido", "", "", "", s.unallocatedCommitted, report.currency],
    ["Resumen", "", "Sin EDT devengado", "", "", "", s.unallocatedAccrued, report.currency],
    [
      "Resumen",
      "",
      "GG empresa imputados",
      "",
      "",
      "",
      !s.companyOverheadVisible
        ? "(oculto)"
        : s.companyOverhead != null
          ? s.companyOverhead
          : "0.00",
      report.currency,
    ],
    [
      "Resumen",
      "",
      "GG empresa incluido en total gastado",
      "",
      "",
      "",
      s.companyOverheadIncludedInSpent ? "si" : "no",
      "",
    ],
    ["Resumen", "", "Total gastado", "", "", "", s.spentTotal, report.currency],
    ["Resumen", "", "Restante vs presupuesto", "", "", "", s.remainingVsBudget, report.currency],
    ["Resumen", "", "% gastado / presupuesto", "", "", "", s.spentPctOfBudget ?? "", "%"],
  ];
  for (const note of report.notes) {
    rows.push(["Nota", "", note, "", "", "", "", ""]);
  }
  for (const w of report.warnings) {
    rows.push(["Aviso", "", w, "", "", "", "", ""]);
  }
  for (const p of report.ggPartidas) {
    rows.push(["PartidaGG", p.wbsCode, p.wbsName, "", "", "", "", report.currency]);
    rows.push([
      "PartidaGG_presupuesto",
      p.wbsCode,
      p.wbsName,
      "",
      "",
      "",
      p.budgetTotalCost,
      report.currency,
    ]);
    rows.push([
      "PartidaGG_devengado",
      p.wbsCode,
      p.wbsName,
      "",
      "",
      "",
      p.accruedCost,
      report.currency,
    ]);
    rows.push([
      "PartidaGG_comprom_abierto",
      p.wbsCode,
      p.wbsName,
      "",
      "",
      "",
      p.openCommittedCost,
      report.currency,
    ]);
  }
  for (const d of report.unallocatedDocuments) {
    rows.push([
      "SinEDT",
      "",
      d.description,
      d.documentType,
      d.documentCode,
      d.supplierName,
      d.amount,
      report.currency,
    ]);
  }
  const fname = `gg_obra_${projectId}_${report.budgetName.replace(/[^a-zA-Z0-9._-]+/g, "_")}`;
  return { content: buildCsv(headers, rows), filename: safeReportFilename(fname, "csv") };
}

export async function exportProjectCashFlowCsv(
  projectId: string,
  filters: ProjectCashFlowFilters,
  ctx: ServiceContext,
): Promise<ReportCsvPayload> {
  const report = await getProjectCashFlowReport(projectId, filters, ctx);
  const excluded = report.warnings.sectionsExcluded ?? [];
  const inflowsAvailable = !excluded.some((entry) => entry.module === "AR");
  const outflowsAvailable = !excluded.some((entry) => entry.module === "AP");
  const partial = excluded.length > 0;
  const headers = [
    "Moneda",
    "TipoFila",
    "Clave",
    "Etiqueta",
    "Ingresos",
    "Egresos",
    "FlujoNeto",
    "FlujoAcumulado",
    "Fecha",
    "Contraparte",
    "NroFactura",
    "Monto",
    "Cuenta",
    "Notas",
  ];
  const rows: string[][] = [];
  for (const cur of report.currencies) {
    rows.push([
      cur.currency,
      "RESUMEN_MONEDA",
      "",
      partial ? "Saldo visible" : "",
      inflowsAvailable ? cur.totalInflows : "",
      outflowsAvailable ? cur.totalOutflows : "",
      cur.netCashFlow,
      "",
      "",
      "",
      "",
      "",
      "",
      "",
    ]);
    for (const p of cur.periods) {
      rows.push([
        cur.currency,
        "PERIODO",
        p.periodKey,
        p.periodLabel,
        inflowsAvailable ? p.inflows : "",
        outflowsAvailable ? p.outflows : "",
        p.netCashFlow,
        p.cumulativeNetCashFlow,
        "",
        "",
        "",
        "",
        "",
        "",
      ]);
    }
    for (const c of cur.collections) {
      rows.push([
        cur.currency,
        "COBRANZA",
        "",
        "",
        "",
        "",
        "",
        "",
        c.date,
        c.clientName,
        String(c.invoiceNumber),
        c.amount,
        c.accountName,
        c.notes ?? "",
      ]);
    }
    for (const p of cur.payments) {
      rows.push([
        cur.currency,
        "PAGO",
        "",
        "",
        "",
        "",
        "",
        "",
        p.date,
        p.supplierName,
        String(p.supplierInvoiceNumber),
        p.amount,
        p.accountName,
        p.notes ?? "",
      ]);
    }
  }

  if (partial) {
    const n = headers.length;
    rows.push(
      padCsvRow(
        [
          "",
          "___AVISOS_REPORTE_PARCIAL___",
          "",
          "Reporte parcial. El flujo neto y acumulado incluye los movimientos visibles.",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
        ],
        n,
      ),
    );
    rows.push(
      padCsvRow(
        ["", "EXCLUSION_HEADER", "Modulo", "Seccion", "", "", "", "", "", "", "", "", "", "Razon"],
        n,
      ),
    );
    for (const ex of excluded) {
      rows.push(
        padCsvRow(
          [
            "",
            "TENANT_MODULE_EXCLUDED",
            ex.module,
            ex.section,
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            ex.reason,
          ],
          n,
        ),
      );
    }
  }

  const slug = `${report.project.code}_${report.dateFrom}_${report.dateTo}`.replace(
    /[^a-zA-Z0-9._-]+/g,
    "_",
  );
  return {
    content: buildCsv(headers, rows),
    filename: safeReportFilename(`flujo_caja_proyecto_${slug}`, "csv"),
  };
}

// â”€â”€â”€ Tenant-level portfolio exports â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function parsePortfolioReportStatus(value: string | undefined) {
  const status = projectStatusSchema.safeParse(value);
  return status.success ? status.data : undefined;
}

export function parsePortfolioProfitabilityExportFilters(
  filters?: { costLayer?: string; revenueBasis?: string; status?: string },
) {
  return {
    costLayer: parseCostVarianceLayer(filters?.costLayer),
    revenueBasis: filters?.revenueBasis === "invoiced" ? "invoiced" as const : "certified" as const,
    status: parsePortfolioReportStatus(filters?.status),
  };
}

export async function exportProjectPortfolioCsv(
  ctx: ServiceContext,
  filters?: { status?: string },
): Promise<ReportCsvPayload> {
  const { getProjectPortfolioReport } = await import("../reports/project-portfolio.service");
  const status = parsePortfolioReportStatus(filters?.status);
  const report = await getProjectPortfolioReport(ctx, { status });
  const headers = [
    "Codigo",
    "Proyecto",
    "Estado",
    "Presupuesto costo",
    "Comprometido",
    "Devengado",
    "Exposicion esperada",
    "Varianza costo",
    "Certificado aprobado",
    "% Exposicion",
    "Advertencia",
    "Moneda",
  ];
  const rows: string[][] = report.rows.map((r) => [
    r.code,
    r.name,
    r.status,
    r.currency ? r.budgetTotalCost : "",
    r.currency ? r.committedCost : "",
    r.currency ? r.accruedCost : "",
    r.currency ? r.expectedCostExposure : "",
    r.currency ? r.costVariance : "",
    r.currency ? r.certifiedApproved : "",
    r.pctExposure ?? "",
    r.warning ?? "",
    r.currency ?? "",
  ]);
  return {
    content: buildCsv(headers, rows),
    filename: safeReportFilename("portafolio_proyectos", "csv"),
  };
}

export async function exportProjectPortfolioXlsx(
  ctx: ServiceContext,
  filters?: { status?: string },
): Promise<ReportXlsxPayload> {
  const { content, filename } = await exportProjectPortfolioCsv(ctx, filters);
  return csvTextToXlsx(content, filename.replace(/\.csv$/i, ""), "Portafolio");
}

export async function exportPortfolioProfitabilityCsv(
  ctx: ServiceContext,
  filters?: { costLayer?: string; revenueBasis?: string; status?: string },
): Promise<ReportCsvPayload> {
  const { getPortfolioProfitabilityReport } =
    await import("../reports/project-profitability.service");
  const parsedFilters = parsePortfolioProfitabilityExportFilters(filters);
  const report = await getPortfolioProfitabilityReport(ctx, parsedFilters);
  const headers = [
    "Codigo",
    "Proyecto",
    "Estado",
    "Moneda",
    "Ingresos",
    "Costos directos",
    "Margen bruto",
    "Margen bruto %",
    "Advertencia",
    "Capa de costo",
    "Base de ingresos",
  ];
  const rows: string[][] = report.rows.map((r) => [
    r.code,
    r.name,
    r.status,
    r.currency ?? "",
    r.revenue ?? "",
    r.directCost ?? "",
    r.grossMargin ?? "",
    r.grossMarginPct ?? "",
    r.warning ?? "",
    parsedFilters.costLayer,
    parsedFilters.revenueBasis,
  ]);
  rows.push([
    "",
    "CONSOLIDADO",
    "",
    report.consolidatedCurrency ?? "",
    report.consolidatedRevenue ?? "",
    report.consolidatedDirectCost ?? "",
    report.consolidatedGrossMargin ?? "",
    report.consolidatedGrossMarginPct ?? "",
    report.warnings.join(" | "),
    parsedFilters.costLayer,
    parsedFilters.revenueBasis,
  ]);
  return {
    content: buildCsv(headers, rows),
    filename: safeReportFilename("rentabilidad_multi_obra", "csv"),
  };
}

export async function exportPortfolioProfitabilityXlsx(
  ctx: ServiceContext,
  filters?: { costLayer?: string; revenueBasis?: string; status?: string },
): Promise<ReportXlsxPayload> {
  const { content, filename } = await exportPortfolioProfitabilityCsv(ctx, filters);
  return csvTextToXlsx(content, filename.replace(/\.csv$/i, ""), "Rentabilidad");
}

export async function exportOverheadByProjectCsv(
  ctx: ServiceContext,
  filters?: { periodFrom?: string; periodTo?: string; dateFrom?: string; dateTo?: string },
): Promise<ReportCsvPayload> {
  const { getOverheadByProjectReport } = await import("../reports/overhead-by-project.service");
  const report = await getOverheadByProjectReport(ctx, {
    periodFrom: filters?.periodFrom ?? filters?.dateFrom,
    periodTo: filters?.periodTo ?? filters?.dateTo,
  });
  const headers = ["Codigo proyecto", "Proyecto", "Periodo", "Moneda", "Monto", "Notas"];
  const rows: string[][] = report.rows.map((r) => [
    r.projectCode,
    r.projectName,
    r.period,
    r.currency,
    r.amount,
    r.notes ?? "",
  ]);
  return {
    content: buildCsv(headers, rows),
    filename: safeReportFilename("gastos_generales_por_proyecto", "csv"),
  };
}

export async function exportOverheadByProjectXlsx(
  ctx: ServiceContext,
  filters?: { periodFrom?: string; periodTo?: string; dateFrom?: string; dateTo?: string },
): Promise<ReportXlsxPayload> {
  const { content, filename } = await exportOverheadByProjectCsv(ctx, filters);
  return csvTextToXlsx(content, filename.replace(/\.csv$/i, ""), "GG por proyecto");
}

export async function exportMultiProjectProcurementCsv(
  ctx: ServiceContext,
  filters?: { dateFrom?: string; dateTo?: string },
): Promise<ReportCsvPayload> {
  const { getMultiProjectProcurementReport } =
    await import("../reports/procurement-deviation.service");
  const report = await getMultiProjectProcurementReport(ctx, filters);
  const headers = [
    "Seccion",
    "Proveedor",
    "Proyecto",
    "OC",
    "Estado",
    "Comprometido",
    "Devengado",
    "Pagado",
    "Monto total",
    "Moneda",
  ];
  const rows: string[][] = [];
  for (const s of report.topSuppliers) {
    rows.push([
      "Proveedores",
      s.supplierName,
      "",
      "",
      "",
      s.committedCost,
      report.apAvailable ? s.accruedCost : "",
      report.apAvailable ? s.paidCost : "",
      "",
      s.currency,
    ]);
  }
  for (const po of report.openPurchaseOrders) {
    rows.push([
      "OC abiertas",
      po.supplierName,
      `${po.projectCode} - ${po.projectName}`,
      po.poNumber,
      po.status,
      "",
      "",
      "",
      po.totalAmount,
      po.currency,
    ]);
  }
  for (const warning of report.warnings) rows.push(padCsvRow(["__AVISO__", warning], headers.length));
  return {
    content: buildCsv(headers, rows),
    filename: safeReportFilename("compras_multi_obra", "csv"),
  };
}

export async function exportMultiProjectProcurementXlsx(
  ctx: ServiceContext,
  filters?: { dateFrom?: string; dateTo?: string },
): Promise<ReportXlsxPayload> {
  const { content, filename } = await exportMultiProjectProcurementCsv(ctx, filters);
  return csvTextToXlsx(content, filename.replace(/\.csv$/i, ""), "Compras");
}
