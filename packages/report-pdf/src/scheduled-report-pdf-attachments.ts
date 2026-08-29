import type { ScheduledReportKey } from "@bloqer/validators";
import { parseJobsiteProjectIdsParam } from "@bloqer/validators";
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
  listDailyJobsiteLogsForSchedule,
  PartialScheduledAttachmentsError,
  prefixScheduledReportAttachmentFilename,
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
  exportProjectPortfolioPdf,
  exportPortfolioProfitabilityPdf,
  exportOverheadByProjectPdf,
  exportMultiProjectProcurementPdf,
  exportJobsiteLogPdf,
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

function slugPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 40);
}

/**
 * Builds one or more PDF attachments for a scheduled report key.
 * TENANT_JOBSITE_DAILY_LOGS may return zero (no parts that day) or many.
 */
export async function buildScheduledReportPdfAttachments(
  reportKey: ScheduledReportKey,
  projectId: string | null,
  params: Record<string, string> | null | undefined,
  ctx: ServiceContext,
): Promise<ScheduledReportPdfAttachment[]> {
  if (reportKey === "TENANT_JOBSITE_DAILY_LOGS") {
    return buildJobsiteDailyLogPdfAttachments(params, ctx);
  }
  const single = await buildScheduledReportPdfAttachment(reportKey, projectId, params, ctx);
  return [single];
}

async function buildJobsiteDailyLogPdfAttachments(
  params: Record<string, string> | null | undefined,
  ctx: ServiceContext,
): Promise<ScheduledReportPdfAttachment[]> {
  const sp = asFilterRecord(params);
  // Hard cap even if legacy params exceed validator max (defensive at run time).
  const projectIds = parseJobsiteProjectIdsParam(sp.jobsiteProjectIds).slice(0, 20);
  const logDateIso = sp.runLogDate?.trim();
  if (!logDateIso || !/^\d{4}-\d{2}-\d{2}$/.test(logDateIso)) {
    throw new ServiceError("VALIDATION", "Fecha de corrida requerida para partes diarios");
  }
  if (projectIds.length === 0) {
    return [];
  }

  const { logs, truncated, takeLimit } = await listDailyJobsiteLogsForSchedule(
    projectIds,
    logDateIso,
    ctx,
  );
  const out: ScheduledReportPdfAttachment[] = [];
  const errors: string[] = [];

  if (truncated) {
    errors.push(
      `Se alcanzó el límite de ${takeLimit} partes para la fecha; algunos no se adjuntaron`,
    );
  }

  for (const log of logs) {
    try {
      const { buffer, filename } = await exportJobsiteLogPdf(log.id, log.projectId, ctx);
      const code = slugPart(log.projectCode || log.projectId.slice(0, 8));
      const uniqueName =
        filename.replace(/\.pdf$/i, "") +
        `_${code}` +
        (log.shift ? `_${slugPart(log.shift)}` : "") +
        `_${log.id.slice(0, 8)}.pdf`;
      out.push(toPdfAttachment(uniqueName, buffer));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error al generar PDF del parte";
      errors.push(`${log.projectCode}: ${msg}`);
    }
  }

  if (out.length === 0 && errors.length > 0) {
    throw new ServiceError("CONFLICT", `No se pudo generar ningún parte: ${errors.join("; ")}`);
  }
  if (out.length > 0 && errors.length > 0) {
    throw new PartialScheduledAttachmentsError(
      out.map((pdf) => ({
        reportKey: "TENANT_JOBSITE_DAILY_LOGS" as const,
        filename: prefixScheduledReportAttachmentFilename("TENANT_JOBSITE_DAILY_LOGS", pdf.filename),
        content: pdf.content,
        contentType: pdf.contentType,
      })),
      errors.map((e) => `TENANT_JOBSITE_DAILY_LOGS: ${e}`),
    );
  }
  return out;
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
    case "TENANT_PROJECT_PORTFOLIO": {
      const { buffer, filename } = await exportProjectPortfolioPdf(ctx, sp);
      return toPdfAttachment(filename, buffer);
    }
    case "TENANT_MULTI_PROJECT_RENTABILITY": {
      const { buffer, filename } = await exportPortfolioProfitabilityPdf(ctx, sp);
      return toPdfAttachment(filename, buffer);
    }
    case "TENANT_OVERHEAD_BY_PROJECT": {
      const { buffer, filename } = await exportOverheadByProjectPdf(ctx, {
        periodFrom: sp.dateFrom ?? sp.periodFrom,
        periodTo: sp.dateTo ?? sp.periodTo,
      });
      return toPdfAttachment(filename, buffer);
    }
    case "TENANT_MULTI_PROJECT_PROCUREMENT": {
      const { buffer, filename } = await exportMultiProjectProcurementPdf(ctx, sp);
      return toPdfAttachment(filename, buffer);
    }
    case "TENANT_JOBSITE_DAILY_LOGS": {
      throw new ServiceError(
        "VALIDATION",
        "Usá buildScheduledReportPdfAttachments para partes diarios",
      );
    }
    default: {
      const _exhaustive: never = reportKey;
      throw new ServiceError("VALIDATION", `PDF no soportado: ${_exhaustive}`);
    }
  }
}
