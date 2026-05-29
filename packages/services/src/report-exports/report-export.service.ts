import type { AgingBucket, AgingFilters } from "../aging/aging.service";
import {
  getReceivableAgingReport,
  getPayableAgingReport,
} from "../aging/aging.service";
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
import type { StockBalanceFilters, StockMovementReportFilters } from "../inventory-reports/inventory-reports.service";
import { getStockBalanceReport, getStockMovementReport } from "../inventory-reports/inventory-reports.service";
import type { CostControlFilters } from "../cost-control/cost-control.service";
import { getProjectCostControl } from "../cost-control/cost-control.service";
import type { BudgetVarianceFilters } from "../reports/budget-variance.service";
import {
  getBudgetVarianceReport,
  parseCostVarianceLayer,
} from "../reports/budget-variance.service";
import type { CertificationReportFilters } from "../reports/certification-evolution.service";
import { getCertificationEvolutionReport } from "../reports/certification-evolution.service";
import type { ProcurementReportFilters } from "../reports/procurement-deviation.service";
import { getProcurementDeviationReport } from "../reports/procurement-deviation.service";
import type { SubcontractReportFilters } from "../reports/subcontract-variance.service";
import { getSubcontractVarianceReport } from "../reports/subcontract-variance.service";
import type { MaterialReportFilters } from "../reports/material-variance.service";
import { getMaterialVarianceReport } from "../reports/material-variance.service";
import type { ProjectCashFlowFilters } from "../project-cash-flow/project-cash-flow.service";
import { getProjectCashFlowReport } from "../project-cash-flow/project-cash-flow.service";
import { ServiceContext, ServiceError } from "../types";
import { buildCsv } from "./csv-export.service";
import { safeReportFilename } from "./filename.service";
import type { ReportCsvPayload } from "./report-export.types";

function padCsvRow(cells: string[], columnCount: number): string[] {
  const r = [...cells];
  while (r.length < columnCount) r.push("");
  return r.slice(0, columnCount);
}

// ─── Parsers (query strings from routes; same semantics as App Router pages) ───

export function parseAgingFilters(sp: Record<string, string | undefined>): AgingFilters {
  const bucket = sp.bucket as AgingBucket | undefined;
  const valid: AgingBucket[] = ["current", "1_30", "31_60", "61_90", "90_plus"];
  return {
    search: sp.search,
    currency: sp.currency,
    bucket: bucket && valid.includes(bucket) ? bucket : undefined,
    asOfDate: sp.asOfDate,
    projectId: sp.projectId,
    contactId: sp.contactId,
    companyId: sp.companyId,
    includePaid: sp.includePaid === "true",
  };
}

export function parseCashPositionFilters(sp: Record<string, string | undefined>): CashPositionFilters {
  return {
    companyId: sp.companyId,
    currency: sp.currency,
  };
}

export function parseMovementReportFilters(sp: Record<string, string | undefined>): MovementReportFilters {
  return {
    accountId: sp.accountId,
    dateFrom: sp.dateFrom,
    dateTo: sp.dateTo,
    type: sp.type,
    sourceType: sp.sourceType,
    currency: sp.currency,
    includeInternalTransfers: sp.includeInternalTransfers === "false" ? false : true,
    corporateApPaymentsOnly: sp.corporateApPayments === "true",
  };
}

export function parseCashFlowFilters(sp: Record<string, string | undefined>): CashFlowFilters {
  const period = sp.period === "day" || sp.period === "week" || sp.period === "month" ? sp.period : undefined;
  return {
    dateFrom: sp.dateFrom,
    dateTo: sp.dateTo,
    period,
    currency: sp.currency,
  };
}

export function parseStockBalanceFilters(sp: Record<string, string | undefined>): StockBalanceFilters {
  return {
    warehouseId: sp.warehouseId,
    productId: sp.productId,
    companyId: sp.companyId,
    projectId: sp.projectId,
    includeZeroStock: sp.includeZeroStock === "true",
  };
}

export function parseStockMovementFilters(sp: Record<string, string | undefined>): StockMovementReportFilters {
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

export function parseCostControlFilters(sp: Record<string, string | undefined>): CostControlFilters {
  return {
    budgetId: sp.budgetId,
    dateFrom: sp.dateFrom,
    dateTo: sp.dateTo,
    wbsSearch: sp.wbsSearch,
  };
}

export function parseBudgetVarianceFilters(sp: Record<string, string | undefined>): BudgetVarianceFilters {
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

export function parseProcurementReportFilters(
  sp: Record<string, string | undefined>,
): ProcurementReportFilters {
  return parseProjectReportDateFilters(sp);
}

export function parseSubcontractReportFilters(
  sp: Record<string, string | undefined>,
): SubcontractReportFilters {
  return parseProjectReportDateFilters(sp);
}

export function parseProjectCashFlowFilters(sp: Record<string, string | undefined>): ProjectCashFlowFilters {
  const period = sp.period === "day" || sp.period === "week" || sp.period === "month" ? sp.period : undefined;
  return {
    dateFrom: sp.dateFrom,
    dateTo: sp.dateTo,
    period,
    currency: sp.currency,
  };
}

// ─── CSV builders ─────────────────────────────────────────────────────────────

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
    "Saldo",
    "Estado",
    "Bucket",
    "FechaCorte",
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

export async function exportPayableAgingCsv(filters: AgingFilters, ctx: ServiceContext): Promise<ReportCsvPayload> {
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
    "Saldo",
    "Estado",
    "Bucket",
    "FechaCorte",
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
  const headers = ["Empresa", "Cuenta", "TipoCuenta", "Moneda", "Estado", "Saldo"];
  const rows = report.accounts.map((a) => [
    a.companyName ?? "",
    a.name,
    a.type,
    a.currency,
    a.status,
    a.balance,
  ]);
  return {
    content: buildCsv(headers, rows),
    filename: safeReportFilename("tesoreria_posicion_caja", "csv"),
  };
}

export async function exportTreasuryMovementsCsv(
  filters: MovementReportFilters,
  ctx: ServiceContext,
): Promise<ReportCsvPayload> {
  const rows = await getAccountMovementReport(filters, ctx);
  const headers = [
    "Fecha",
    "Cuenta",
    "Tipo",
    "Origen",
    "EtiquetaOrigen",
    "Importe",
    "ImporteSignado",
    "Moneda",
    "Descripcion",
    "TransferenciaInterna",
    "SaldoAcumulado",
  ];
  const data = rows.map((r) => [
    r.movementDate,
    r.accountName,
    r.type,
    r.sourceType,
    r.sourceLabel,
    r.amount,
    r.signedAmount,
    r.currency,
    r.description,
    r.isInternalTransfer ? "Si" : "No",
    r.runningBalance ?? "",
  ]);
  return {
    content: buildCsv(headers, data),
    filename: safeReportFilename("tesoreria_movimientos", "csv"),
  };
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
    "WBS",
    "Tipo",
    "Origen",
    "EtiquetaOrigen",
    "Cantidad",
    "CantidadSignada",
    "CostoUnitario",
    "CostoTotal",
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
    r.signedQuantity,
    r.unitCost ?? "",
    r.totalCost ?? "",
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
    throw new ServiceError("CONFLICT", "No hay presupuesto aprobado o cerrado para exportar el control de costos");
  }
  if (result.type === "BUDGET_SELECTION_REQUIRED") {
    throw new ServiceError("CONFLICT", "Seleccioná un presupuesto para exportar el control de costos");
  }
  const r = result;
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
    x.inventoryConsumedCost,
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
    r.totals.inventoryConsumedCost,
    r.totals.operationalProgressQty,
    "",
    "",
    r.totals.expectedCostExposure,
    r.totals.remainingBudgetCost,
    r.totals.costVariance,
    r.totals.projectedMargin,
    "",
    "",
    "",
  ]);
  rows.push([
    "__NO_ASIGNADO__",
    "Costos no asignados a WBS",
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
    r.unallocatedInventoryConsumedCost,
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
  ]);

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

  const fname = `control_costos_${r.projectId}_${r.budgetName.replace(/[^a-zA-Z0-9._-]+/g, "_")}`;
  return {
    content: buildCsv(headers, rows),
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
      p.invoicedAmount,
      p.collectedAmount,
      p.paymentStatus,
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
      m.invoicedAmount,
      m.collectedAmount,
      "",
      "",
      "",
      "",
      "",
    ]);
  }

  const fname = `certificaciones_${projectId}_${result.budgetName.replace(/[^a-zA-Z0-9._-]+/g, "_")}`;
  return {
    content: buildCsv(headers, rows),
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
  ];
  const rows: string[][] = result.byWbs.map((r) => [
    "PARTIDA",
    r.wbsCode,
    r.wbsName,
    "",
    r.budgetMaterial,
    r.committedCost,
    r.accruedCost,
    r.varianceAmount,
    r.variancePct ?? "",
  ]);
  for (const u of result.unallocated) {
    rows.push([
      u.documentType,
      u.documentCode,
      u.description,
      u.supplierName,
      "",
      "",
      u.amount,
      "",
      "",
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
      s.accruedCost,
      s.paidCost,
      s.openCommitted,
    ]);
  }
  const fname = `compras_${projectId}_${result.budgetName.replace(/[^a-zA-Z0-9._-]+/g, "_")}`;
  return { content: buildCsv(headers, rows), filename: safeReportFilename(fname, "csv") };
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
  ]);
  for (const c of result.contracts) {
    rows.push([
      "CONTRATO",
      c.code,
      `${c.title} — ${c.subcontractorName}`,
      "",
      c.totalValue,
      c.certifiedCost,
      "",
      c.status,
    ]);
  }
  const fname = `subcontratos_${projectId}_${result.budgetName.replace(/[^a-zA-Z0-9._-]+/g, "_")}`;
  return { content: buildCsv(headers, rows), filename: safeReportFilename(fname, "csv") };
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
    r.consumedCost,
    r.variance,
    r.variancePct ?? "",
  ]);
  rows.push([
    "TOTAL",
    "",
    result.totals.budgetMaterial,
    result.totals.consumedCost,
    result.totals.variance,
    "",
  ]);
  const fname = `materiales_${projectId}_${result.budgetName.replace(/[^a-zA-Z0-9._-]+/g, "_")}`;
  return { content: buildCsv(headers, rows), filename: safeReportFilename(fname, "csv") };
}

export async function exportProjectCashFlowCsv(
  projectId: string,
  filters: ProjectCashFlowFilters,
  ctx: ServiceContext,
): Promise<ReportCsvPayload> {
  const report = await getProjectCashFlowReport(projectId, filters, ctx);
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
      "",
      cur.totalInflows,
      cur.totalOutflows,
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
        p.inflows,
        p.outflows,
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

  const excluded = report.warnings.sectionsExcluded;
  if (excluded && excluded.length > 0) {
    const n = headers.length;
    rows.push(
      padCsvRow(
        [
          "",
          "___AVISOS_REPORTE_PARCIAL___",
          "",
          "Secciones excluidas: modulo tenant deshabilitado (ver Modulo / Seccion / Razon)",
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
          ["", "TENANT_MODULE_EXCLUDED", ex.module, ex.section, "", "", "", "", "", "", "", "", "", ex.reason],
          n,
        ),
      );
    }
  }

  const slug = `${report.project.code}_${report.dateFrom}_${report.dateTo}`.replace(/[^a-zA-Z0-9._-]+/g, "_");
  return {
    content: buildCsv(headers, rows),
    filename: safeReportFilename(`flujo_caja_proyecto_${slug}`, "csv"),
  };
}

/** Phase 9C+: extend when more reports support PDF. */
export function assertPdfExportNotRequested(format: string | null | undefined): void {
  if (format?.toLowerCase() === "pdf") {
    throw new ServiceError("VALIDATION", "Exportación PDF no disponible para este reporte");
  }
}
