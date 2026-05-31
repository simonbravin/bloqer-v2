import type { ScheduledReportFormat } from "@bloqer/database";
import type { ScheduledReportKey } from "@bloqer/validators";
import {
  exportBudgetVarianceCsv,
  exportCertificationEvolutionCsv,
  exportCompanyPayablesCsv,
  exportCompanySupplierInvoicesCsv,
  exportMaterialVarianceCsv,
  exportPayableAgingCsv,
  exportProcurementDeviationCsv,
  exportProjectCashFlowCsv,
  exportProjectCostControlCsv,
  exportProjectIncomeExpenseCsv,
  exportProjectProfitabilityCsv,
  exportReceivableAgingCsv,
  exportStockBalanceCsv,
  exportStockMovementsCsv,
  exportSubcontractVarianceCsv,
  exportTreasuryCashFlowCsv,
  exportTreasuryMovementsCsv,
  exportCashPositionCsv,
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
} from "../report-exports/report-export.service";
import { ServiceContext, ServiceError } from "../types";
import { getTenantModuleGate } from "../tenant-modules/tenant-module.service";
import { SCHEDULED_REPORT_KEY_META } from "./scheduled-report-registry";

export type ScheduledReportAttachment = {
  filename: string;
  content: Buffer;
  contentType: string;
  reportKey: ScheduledReportKey;
};

/** Avoid duplicate attachment names when a schedule bundles several reports. */
export function prefixScheduledReportAttachmentFilename(
  reportKey: ScheduledReportKey,
  filename: string,
): string {
  const slug = reportKey.toLowerCase().replace(/_/g, "-");
  const dot = filename.lastIndexOf(".");
  if (dot <= 0) return `${slug}_${filename}`;
  return `${slug}_${filename.slice(0, dot)}${filename.slice(dot)}`;
}

function asFilterRecord(params: Record<string, string> | null | undefined): Record<string, string | undefined> {
  return params ?? {};
}

async function buildScheduledReportCsvAttachment(
  reportKey: ScheduledReportKey,
  projectId: string | null,
  params: Record<string, string> | null | undefined,
  ctx: ServiceContext,
): Promise<ScheduledReportAttachment> {
  const sp = asFilterRecord(params);

  switch (reportKey) {
    case "TENANT_AR_AGING": {
      const { content, filename } = await exportReceivableAgingCsv(parseAgingFilters(sp), ctx);
      return {
        reportKey,
        filename,
        content: Buffer.from(content, "utf-8"),
        contentType: "text/csv; charset=utf-8",
      };
    }
    case "TENANT_AP_AGING": {
      const { content, filename } = await exportPayableAgingCsv(parseAgingFilters(sp), ctx);
      return {
        reportKey,
        filename,
        content: Buffer.from(content, "utf-8"),
        contentType: "text/csv; charset=utf-8",
      };
    }
    case "TENANT_TREASURY_CASH_POSITION": {
      const { content, filename } = await exportCashPositionCsv(parseCashPositionFilters(sp), ctx);
      return {
        reportKey,
        filename,
        content: Buffer.from(content, "utf-8"),
        contentType: "text/csv; charset=utf-8",
      };
    }
    case "TENANT_TREASURY_MOVEMENTS": {
      const { content, filename } = await exportTreasuryMovementsCsv(parseMovementReportFilters(sp), ctx);
      return {
        reportKey,
        filename,
        content: Buffer.from(content, "utf-8"),
        contentType: "text/csv; charset=utf-8",
      };
    }
    case "TENANT_TREASURY_CASH_FLOW": {
      const { content, filename } = await exportTreasuryCashFlowCsv(parseCashFlowFilters(sp), ctx);
      return {
        reportKey,
        filename,
        content: Buffer.from(content, "utf-8"),
        contentType: "text/csv; charset=utf-8",
      };
    }
    case "TENANT_INVENTORY_STOCK": {
      const { content, filename } = await exportStockBalanceCsv(parseStockBalanceFilters(sp), ctx);
      return {
        reportKey,
        filename,
        content: Buffer.from(content, "utf-8"),
        contentType: "text/csv; charset=utf-8",
      };
    }
    case "TENANT_INVENTORY_MOVEMENTS": {
      const { content, filename } = await exportStockMovementsCsv(parseStockMovementFilters(sp), ctx);
      return {
        reportKey,
        filename,
        content: Buffer.from(content, "utf-8"),
        contentType: "text/csv; charset=utf-8",
      };
    }
    case "TENANT_CORPORATE_PAYABLES": {
      const { content, filename } = await exportCompanyPayablesCsv(parseCompanyPayableExportFilters(sp), ctx);
      return {
        reportKey,
        filename,
        content: Buffer.from(content, "utf-8"),
        contentType: "text/csv; charset=utf-8",
      };
    }
    case "TENANT_CORPORATE_SUPPLIER_INVOICES": {
      const { content, filename } = await exportCompanySupplierInvoicesCsv(
        parseCompanySupplierInvoiceExportFilters(sp),
        ctx,
      );
      return {
        reportKey,
        filename,
        content: Buffer.from(content, "utf-8"),
        contentType: "text/csv; charset=utf-8",
      };
    }
    case "PROJECT_COST_CONTROL": {
      if (!projectId) throw new ServiceError("VALIDATION", "projectId requerido");
      const { content, filename } = await exportProjectCostControlCsv(projectId, parseCostControlFilters(sp), ctx);
      return {
        reportKey,
        filename,
        content: Buffer.from(content, "utf-8"),
        contentType: "text/csv; charset=utf-8",
      };
    }
    case "PROJECT_CASH_FLOW": {
      if (!projectId) throw new ServiceError("VALIDATION", "projectId requerido");
      const { content, filename } = await exportProjectCashFlowCsv(projectId, parseProjectCashFlowFilters(sp), ctx);
      return {
        reportKey,
        filename,
        content: Buffer.from(content, "utf-8"),
        contentType: "text/csv; charset=utf-8",
      };
    }
    case "PROJECT_BUDGET_VARIANCE": {
      if (!projectId) throw new ServiceError("VALIDATION", "projectId requerido");
      const { content, filename } = await exportBudgetVarianceCsv(projectId, parseBudgetVarianceFilters(sp), ctx);
      return {
        reportKey,
        filename,
        content: Buffer.from(content, "utf-8"),
        contentType: "text/csv; charset=utf-8",
      };
    }
    case "PROJECT_CERTIFICATIONS": {
      if (!projectId) throw new ServiceError("VALIDATION", "projectId requerido");
      const { content, filename } = await exportCertificationEvolutionCsv(
        projectId,
        parseCertificationReportFilters(sp),
        ctx,
      );
      return {
        reportKey,
        filename,
        content: Buffer.from(content, "utf-8"),
        contentType: "text/csv; charset=utf-8",
      };
    }
    case "PROJECT_PROCUREMENT": {
      if (!projectId) throw new ServiceError("VALIDATION", "projectId requerido");
      const { content, filename } = await exportProcurementDeviationCsv(
        projectId,
        parseProcurementReportFilters(sp),
        ctx,
      );
      return {
        reportKey,
        filename,
        content: Buffer.from(content, "utf-8"),
        contentType: "text/csv; charset=utf-8",
      };
    }
    case "PROJECT_SUBCONTRACTS": {
      if (!projectId) throw new ServiceError("VALIDATION", "projectId requerido");
      const { content, filename } = await exportSubcontractVarianceCsv(
        projectId,
        parseSubcontractReportFilters(sp),
        ctx,
      );
      return {
        reportKey,
        filename,
        content: Buffer.from(content, "utf-8"),
        contentType: "text/csv; charset=utf-8",
      };
    }
    case "PROJECT_MATERIALS": {
      if (!projectId) throw new ServiceError("VALIDATION", "projectId requerido");
      const { content, filename } = await exportMaterialVarianceCsv(projectId, parseProjectReportDateFilters(sp), ctx);
      return {
        reportKey,
        filename,
        content: Buffer.from(content, "utf-8"),
        contentType: "text/csv; charset=utf-8",
      };
    }
    case "PROJECT_INCOME_EXPENSE": {
      if (!projectId) throw new ServiceError("VALIDATION", "projectId requerido");
      const { content, filename } = await exportProjectIncomeExpenseCsv(
        projectId,
        parseIncomeExpenseFilters(sp),
        ctx,
      );
      return {
        reportKey,
        filename,
        content: Buffer.from(content, "utf-8"),
        contentType: "text/csv; charset=utf-8",
      };
    }
    case "PROJECT_PROFITABILITY": {
      if (!projectId) throw new ServiceError("VALIDATION", "projectId requerido");
      const { content, filename } = await exportProjectProfitabilityCsv(
        projectId,
        parseProfitabilityFilters(sp),
        ctx,
      );
      return {
        reportKey,
        filename,
        content: Buffer.from(content, "utf-8"),
        contentType: "text/csv; charset=utf-8",
      };
    }
    default: {
      const _exhaustive: never = reportKey;
      throw new ServiceError("VALIDATION", `CSV no soportado: ${_exhaustive}`);
    }
  }
}

export async function assertReportKeyEnabledAtRun(
  reportKey: ScheduledReportKey,
  ctx: ServiceContext,
): Promise<void> {
  const gate = await getTenantModuleGate(ctx);
  const meta = SCHEDULED_REPORT_KEY_META[reportKey];
  if (!meta.requiredModules.every((m) => gate.isEnabled(m))) {
    throw new ServiceError("VALIDATION", `Módulo deshabilitado para ${reportKey}`);
  }
}

export type BuildScheduledReportAttachmentFn = (
  reportKey: ScheduledReportKey,
  format: ScheduledReportFormat,
  projectId: string | null,
  params: Record<string, string> | null | undefined,
  ctx: ServiceContext,
) => Promise<ScheduledReportAttachment>;

export async function buildScheduledReportCsvAttachmentForRunner(
  reportKey: ScheduledReportKey,
  projectId: string | null,
  params: Record<string, string> | null | undefined,
  ctx: ServiceContext,
): Promise<ScheduledReportAttachment> {
  await assertReportKeyEnabledAtRun(reportKey, ctx);
  const att = await buildScheduledReportCsvAttachment(reportKey, projectId, params, ctx);
  return {
    ...att,
    filename: prefixScheduledReportAttachmentFilename(reportKey, att.filename),
  };
}
