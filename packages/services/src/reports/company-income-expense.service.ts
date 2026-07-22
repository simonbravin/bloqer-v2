import { Prisma, prisma } from "@bloqer/database";
import { can } from "@bloqer/domain";
import { getTenantModuleGate } from "../tenant-modules/tenant-module.service";
import { companyScopeFilter, companyScopeRelationFilter } from "../company-scope";
import { ServiceContext, ServiceError } from "../types";
import { defaultReportDateRange, monthKey, monthLabel } from "./report-month";
import {
  getProjectIncomeExpenseReport,
  type IncomeExpensePoint,
} from "./project-income-expense.service";

export type CompanyIncomeExpenseFilters = {
  dateFrom?: string;
  dateTo?: string;
};

export type CompanyIncomeExpenseReport = {
  type: "REPORT";
  dateFrom: string;
  dateTo: string;
  projectCount: number;
  series: IncomeExpensePoint[];
  warnings: string[];
  consolidationNote: string | null;
};

function mergeSeriesPoints(target: Map<string, IncomeExpensePoint>, point: IncomeExpensePoint): void {
  const prev = target.get(point.periodKey);
  if (!prev) {
    target.set(point.periodKey, { ...point });
    return;
  }
  const add = (a: string, b: string) => (a ? new Prisma.Decimal(a).plus(b).toFixed(2) : b);
  target.set(
    point.periodKey,
    recomputeMargins({
      periodKey: point.periodKey,
      periodLabel: point.periodLabel,
      certifiedAmount: add(prev.certifiedAmount, point.certifiedAmount),
      invoicedAmount: add(prev.invoicedAmount, point.invoicedAmount),
      collectedAmount: add(prev.collectedAmount, point.collectedAmount),
      costAccrued: add(prev.costAccrued, point.costAccrued),
      costPaid: add(prev.costPaid, point.costPaid),
      grossMarginAccrued: "0",
      grossMarginCash: "0",
    }),
  );
}

function recomputeMargins(point: IncomeExpensePoint): IncomeExpensePoint {
  const certified = new Prisma.Decimal(point.certifiedAmount);
  const collected = new Prisma.Decimal(point.collectedAmount);
  const costAccrued = new Prisma.Decimal(point.costAccrued);
  const costPaid = new Prisma.Decimal(point.costPaid);
  return {
    ...point,
    grossMarginAccrued: certified.minus(costAccrued).toFixed(2),
    grossMarginCash: collected.minus(costPaid).toFixed(2),
  };
}

/**
 * Tenant rollup of project income vs expense series plus corporate AP payments/accruals.
 * Sums amounts across projects per month — suitable when projects share reporting currency
 * or for directional trends; does not FX-convert across project currencies in v1.
 */
export async function getCompanyIncomeExpenseReport(
  filters: CompanyIncomeExpenseFilters,
  ctx: ServiceContext,
): Promise<CompanyIncomeExpenseReport> {
  const gate = await getTenantModuleGate(ctx);
  if (
    !gate.isEnabled("PROJECTS")
    && !gate.isEnabled("AR")
    && !gate.isEnabled("AP")
  ) {
    throw new ServiceError("FORBIDDEN", "Sin módulos para reporte económico consolidado");
  }

  const range =
    filters.dateFrom && filters.dateTo
      ? { dateFrom: filters.dateFrom, dateTo: filters.dateTo }
      : defaultReportDateRange(12);

  const warnings: string[] = [
    "Consolidado tenant: suma series por proyecto sin convertir monedas distintas. Usá reportes por obra para detalle multimoneda.",
  ];

  const projects = await prisma.project.findMany({
    where: {
      tenantId: ctx.tenantId,
      status: { notIn: ["CANCELLED"] },
      ...companyScopeFilter(ctx),
    },
    select: { id: true },
  });

  const monthlyMap = new Map<string, IncomeExpensePoint>();

  if (can(ctx.roles, "VIEW", "PROJECTS") || can(ctx.roles, "VIEW", "AR") || can(ctx.roles, "VIEW", "AP")) {
    const reports = await Promise.all(
      projects.map((p) =>
        getProjectIncomeExpenseReport(
          p.id,
          { dateFrom: range.dateFrom, dateTo: range.dateTo },
          ctx,
        ).catch(() => null),
      ),
    );
    for (const report of reports) {
      if (!report) continue;
      for (const point of report.series) {
        mergeSeriesPoints(monthlyMap, point);
      }
    }
  }

  const dateFrom = new Date(range.dateFrom);
  const dateTo = new Date(range.dateTo);

  if (gate.isEnabled("AP") && can(ctx.roles, "VIEW", "AP")) {
    const corpPayments = await prisma.payment.findMany({
      where: {
        tenantId: ctx.tenantId,
        projectId: null,
        status: "CONFIRMED",
        paymentDate: { gte: dateFrom, lte: dateTo },
        // Payment.companyId es NOT NULL → scope directo por empresa.
        ...(ctx.companyId ? { companyId: ctx.companyId } : {}),
      },
      select: { paymentDate: true, amount: true },
    });
    for (const p of corpPayments) {
      const key = monthKey(p.paymentDate);
      const existing = monthlyMap.get(key) ?? {
        periodKey: key,
        periodLabel: monthLabel(key),
        certifiedAmount: "0.00",
        invoicedAmount: "0.00",
        collectedAmount: "0.00",
        costAccrued: "0.00",
        costPaid: "0.00",
        grossMarginAccrued: "0.00",
        grossMarginCash: "0.00",
      };
      existing.costPaid = new Prisma.Decimal(existing.costPaid).plus(p.amount).toFixed(2);
      monthlyMap.set(key, recomputeMargins(existing));
    }

    const corpInvoices = await prisma.supplierInvoice.findMany({
      where: {
        tenantId: ctx.tenantId,
        projectId: null,
        status: "ISSUED",
        issueDate: { gte: dateFrom, lte: dateTo },
        // SupplierInvoice.companyId es NOT NULL → scope directo por empresa.
        ...(ctx.companyId ? { companyId: ctx.companyId } : {}),
      },
      select: { issueDate: true, totalAmount: true },
    });
    for (const inv of corpInvoices) {
      const key = monthKey(inv.issueDate);
      const existing = monthlyMap.get(key) ?? {
        periodKey: key,
        periodLabel: monthLabel(key),
        certifiedAmount: "0.00",
        invoicedAmount: "0.00",
        collectedAmount: "0.00",
        costAccrued: "0.00",
        costPaid: "0.00",
        grossMarginAccrued: "0.00",
        grossMarginCash: "0.00",
      };
      existing.costAccrued = new Prisma.Decimal(existing.costAccrued).plus(inv.totalAmount).toFixed(2);
      monthlyMap.set(key, recomputeMargins(existing));
    }
  }

  const series = [...monthlyMap.values()]
    .sort((a, b) => a.periodKey.localeCompare(b.periodKey))
    .map(recomputeMargins);

  const budgetCurrencies = await prisma.budget.findMany({
    where: {
      tenantId: ctx.tenantId,
      status: { in: ["APPROVED", "CLOSED"] },
      ...companyScopeRelationFilter("project", ctx),
    },
    select: { currency: true },
    distinct: ["currency"],
  });
  const consolidationNote =
    budgetCurrencies.length > 1
      ? "Hay obras con presupuestos en más de una moneda: el consolidado suma importes nominales sin tipo de cambio."
      : null;

  return {
    type: "REPORT",
    dateFrom: range.dateFrom,
    dateTo: range.dateTo,
    projectCount: projects.length,
    series,
    warnings,
    consolidationNote,
  };
}
