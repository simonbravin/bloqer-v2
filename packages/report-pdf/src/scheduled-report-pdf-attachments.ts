import type { ScheduledReportKey } from "@bloqer/validators";
import type { ServiceContext } from "@bloqer/services";
import {
  parseAgingFilters,
  parseBudgetVarianceFilters,
  parseCashFlowFilters,
  parseCashPositionFilters,
  parseCertificationReportFilters,
  parseCompanyPayableExportFilters,
  parseCompanySupplierInvoiceExportFilters,
  parseCostControlFilters,
  parseMovementReportFilters,
  parseProcurementReportFilters,
  parseIncomeExpenseFilters,
  parseProfitabilityFilters,
  parseProjectCashFlowFilters,
  parseProjectReportDateFilters,
  parseStockBalanceFilters,
  parseStockMovementFilters,
  parseSubcontractReportFilters,
  ServiceError,
} from "@bloqer/services";
import {
  exportBudgetVariancePdf,
  exportCertificationEvolutionPdf,
  exportCompanyPayablesPdf,
  exportCompanySupplierInvoicesPdf,
  exportMaterialVariancePdf,
  exportPayableAgingPdf,
  exportProcurementDeviationPdf,
  exportProjectCashFlowPdf,
  exportProjectCostControlPdf,
  exportProjectIncomeExpensePdf,
  exportProjectProfitabilityPdf,
  exportReceivableAgingPdf,
  exportStockBalancePdf,
  exportStockMovementsPdf,
  exportSubcontractVariancePdf,
  exportTreasuryCashFlowPdf,
  exportTreasuryCashPositionPdf,
  exportTreasuryMovementsPdf,
} from "./report-pdf-export.service";

export type ScheduledReportPdfAttachment = {
  filename: string;
  content: Buffer;
  contentType: "application/pdf";
};

function asFilterRecord(params: Record<string, string> | null | undefined): Record<string, string | undefined> {
  return params ?? {};
}

function assertValidPdfBuffer(buffer: Buffer): void {
  if (buffer.length < 5) {
    throw new ServiceError("CONFLICT", "PDF vacío o inválido");
  }
  const header = buffer.subarray(0, 5).toString("ascii");
  if (header !== "%PDF-") {
    throw new ServiceError("CONFLICT", "PDF vacío o inválido");
  }
}

function toPdfAttachment(filename: string, buffer: Buffer): ScheduledReportPdfAttachment {
  assertValidPdfBuffer(buffer);
  return { filename, content: buffer, contentType: "application/pdf" };
}

export async function buildScheduledReportPdfAttachment(
  reportKey: ScheduledReportKey,
  projectId: string | null,
  params: Record<string, string> | null | undefined,
  ctx: ServiceContext,
): Promise<ScheduledReportPdfAttachment> {
  const sp = asFilterRecord(params);
  switch (reportKey) {
    case "TENANT_AR_AGING": {
      const { buffer, filename } = await exportReceivableAgingPdf(parseAgingFilters(sp), ctx);
      return toPdfAttachment(filename, buffer);
    }
    case "TENANT_AP_AGING": {
      const { buffer, filename } = await exportPayableAgingPdf(parseAgingFilters(sp), ctx);
      return toPdfAttachment(filename, buffer);
    }
    case "TENANT_TREASURY_CASH_POSITION": {
      const { buffer, filename } = await exportTreasuryCashPositionPdf(parseCashPositionFilters(sp), ctx);
      return toPdfAttachment(filename, buffer);
    }
    case "TENANT_TREASURY_MOVEMENTS": {
      const { buffer, filename } = await exportTreasuryMovementsPdf(parseMovementReportFilters(sp), ctx);
      return toPdfAttachment(filename, buffer);
    }
    case "TENANT_TREASURY_CASH_FLOW": {
      const { buffer, filename } = await exportTreasuryCashFlowPdf(parseCashFlowFilters(sp), ctx);
      return toPdfAttachment(filename, buffer);
    }
    case "TENANT_INVENTORY_STOCK": {
      const { buffer, filename } = await exportStockBalancePdf(parseStockBalanceFilters(sp), ctx);
      return toPdfAttachment(filename, buffer);
    }
    case "TENANT_INVENTORY_MOVEMENTS": {
      const { buffer, filename } = await exportStockMovementsPdf(parseStockMovementFilters(sp), ctx);
      return toPdfAttachment(filename, buffer);
    }
    case "TENANT_CORPORATE_PAYABLES": {
      const { buffer, filename } = await exportCompanyPayablesPdf(parseCompanyPayableExportFilters(sp), ctx);
      return toPdfAttachment(filename, buffer);
    }
    case "TENANT_CORPORATE_SUPPLIER_INVOICES": {
      const { buffer, filename } = await exportCompanySupplierInvoicesPdf(
        parseCompanySupplierInvoiceExportFilters(sp),
        ctx,
      );
      return toPdfAttachment(filename, buffer);
    }
    case "PROJECT_COST_CONTROL": {
      if (!projectId) throw new ServiceError("VALIDATION", "projectId requerido");
      const { buffer, filename } = await exportProjectCostControlPdf(
        projectId,
        parseCostControlFilters(sp),
        ctx,
      );
      return toPdfAttachment(filename, buffer);
    }
    case "PROJECT_CASH_FLOW": {
      if (!projectId) throw new ServiceError("VALIDATION", "projectId requerido");
      const { buffer, filename } = await exportProjectCashFlowPdf(
        projectId,
        parseProjectCashFlowFilters(sp),
        ctx,
      );
      return toPdfAttachment(filename, buffer);
    }
    case "PROJECT_BUDGET_VARIANCE": {
      if (!projectId) throw new ServiceError("VALIDATION", "projectId requerido");
      const { buffer, filename } = await exportBudgetVariancePdf(
        projectId,
        parseBudgetVarianceFilters(sp),
        ctx,
      );
      return toPdfAttachment(filename, buffer);
    }
    case "PROJECT_CERTIFICATIONS": {
      if (!projectId) throw new ServiceError("VALIDATION", "projectId requerido");
      const { buffer, filename } = await exportCertificationEvolutionPdf(
        projectId,
        parseCertificationReportFilters(sp),
        ctx,
      );
      return toPdfAttachment(filename, buffer);
    }
    case "PROJECT_PROCUREMENT": {
      if (!projectId) throw new ServiceError("VALIDATION", "projectId requerido");
      const { buffer, filename } = await exportProcurementDeviationPdf(
        projectId,
        parseProcurementReportFilters(sp),
        ctx,
      );
      return toPdfAttachment(filename, buffer);
    }
    case "PROJECT_SUBCONTRACTS": {
      if (!projectId) throw new ServiceError("VALIDATION", "projectId requerido");
      const { buffer, filename } = await exportSubcontractVariancePdf(
        projectId,
        parseSubcontractReportFilters(sp),
        ctx,
      );
      return toPdfAttachment(filename, buffer);
    }
    case "PROJECT_MATERIALS": {
      if (!projectId) throw new ServiceError("VALIDATION", "projectId requerido");
      const { buffer, filename } = await exportMaterialVariancePdf(projectId, parseProjectReportDateFilters(sp), ctx);
      return toPdfAttachment(filename, buffer);
    }
    case "PROJECT_INCOME_EXPENSE": {
      if (!projectId) throw new ServiceError("VALIDATION", "projectId requerido");
      const { buffer, filename } = await exportProjectIncomeExpensePdf(
        projectId,
        parseIncomeExpenseFilters(sp),
        ctx,
      );
      return toPdfAttachment(filename, buffer);
    }
    case "PROJECT_PROFITABILITY": {
      if (!projectId) throw new ServiceError("VALIDATION", "projectId requerido");
      const { buffer, filename } = await exportProjectProfitabilityPdf(
        projectId,
        parseProfitabilityFilters(sp),
        ctx,
      );
      return toPdfAttachment(filename, buffer);
    }
    default: {
      const _exhaustive: never = reportKey;
      throw new ServiceError("VALIDATION", `PDF no soportado: ${_exhaustive}`);
    }
  }
}
