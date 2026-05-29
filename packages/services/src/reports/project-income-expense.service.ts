import { Prisma, prisma } from "@bloqer/database";
import { can } from "@bloqer/domain";
import { canViewProjectCostControlReport } from "../cost-control/cost-control.service";
import { canViewProjectCashFlowReport } from "../project-cash-flow/project-cash-flow.service";
import {
  assertTenantModuleEnabledWithGate,
  getTenantModuleGate,
} from "../tenant-modules/tenant-module.service";
import type { TenantModuleSectionExcludedWarning } from "../tenant-modules/tenant-module-report-warnings";
import { ServiceContext, ServiceError } from "../types";
import { getCertificationEvolutionReport } from "./certification-evolution.service";
import { defaultReportDateRange, monthKey, monthLabel } from "./report-month";

export type IncomeExpenseFilters = {
  budgetId?: string;
  dateFrom?: string;
  dateTo?: string;
};

export type IncomeExpensePoint = {
  periodKey: string;
  periodLabel: string;
  certifiedAmount: string;
  invoicedAmount: string;
  collectedAmount: string;
  costAccrued: string;
  costPaid: string;
  grossMarginAccrued: string;
  grossMarginCash: string;
};

export type IncomeExpenseReport = {
  type: "REPORT";
  projectId: string;
  budgetId: string | null;
  budgetName: string | null;
  dateFrom: string;
  dateTo: string;
  series: IncomeExpensePoint[];
  totals: {
    certifiedAmount: string;
    invoicedAmount: string;
    collectedAmount: string;
    costAccrued: string;
    costPaid: string;
    grossMarginAccrued: string;
    grossMarginCash: string;
    grossMarginAccruedPct: string | null;
    grossMarginCashPct: string | null;
  };
  warnings: string[];
  sectionsExcluded: TenantModuleSectionExcludedWarning[];
};

function pct(revenue: Prisma.Decimal, cost: Prisma.Decimal): string | null {
  if (revenue.isZero()) return null;
  return revenue.minus(cost).div(revenue).times(100).toFixed(2);
}

export async function getProjectIncomeExpenseReport(
  projectId: string,
  filters: IncomeExpenseFilters,
  ctx: ServiceContext,
): Promise<IncomeExpenseReport> {
  if (!canViewProjectCostControlReport(ctx.roles) && !canViewProjectCashFlowReport(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver ingresos vs gastos");
  }

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new ServiceError("NOT_FOUND", "Proyecto no encontrado");
  if (project.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");

  const range =
    filters.dateFrom && filters.dateTo
      ? { dateFrom: filters.dateFrom, dateTo: filters.dateTo }
      : defaultReportDateRange(12);

  const gate = await getTenantModuleGate(ctx);
  assertTenantModuleEnabledWithGate(gate, "PROJECTS");
  const warnings: string[] = [];
  const sectionsExcluded: TenantModuleSectionExcludedWarning[] = [];

  const dateFrom = new Date(range.dateFrom);
  const dateTo = new Date(range.dateTo);

  const monthlyMap = new Map<
    string,
    {
      certified: Prisma.Decimal;
      invoiced: Prisma.Decimal;
      collected: Prisma.Decimal;
      costAccrued: Prisma.Decimal;
      costPaid: Prisma.Decimal;
    }
  >();

  function ensure(key: string) {
    if (!monthlyMap.has(key)) {
      monthlyMap.set(key, {
        certified: new Prisma.Decimal(0),
        invoiced: new Prisma.Decimal(0),
        collected: new Prisma.Decimal(0),
        costAccrued: new Prisma.Decimal(0),
        costPaid: new Prisma.Decimal(0),
      });
    }
    return monthlyMap.get(key)!;
  }

  let budgetId: string | null = null;
  let budgetName: string | null = null;

  if (gate.isEnabled("CERTIFICATIONS") && gate.isEnabled("BUDGETS")) {
    const certReport = await getCertificationEvolutionReport(
      projectId,
      { budgetId: filters.budgetId, dateFrom: range.dateFrom, dateTo: range.dateTo },
      ctx,
    );
    if (certReport.type === "REPORT") {
      budgetId = certReport.budgetId;
      budgetName = certReport.budgetName;
      for (const p of certReport.monthlySeries) {
        const b = ensure(p.periodKey);
        b.certified = b.certified.plus(p.certifiedAmount);
        b.invoiced = b.invoiced.plus(p.invoicedAmount);
        b.collected = b.collected.plus(p.collectedAmount);
      }
      warnings.push(...certReport.warnings);
      sectionsExcluded.push(...certReport.sectionsExcluded);
    }
  } else {
    if (!gate.isEnabled("CERTIFICATIONS")) {
      sectionsExcluded.push({
        module: "CERTIFICATIONS",
        section: "income_series",
        reason: "TENANT_MODULE_DISABLED",
      });
    }
  }

  const apEnabled = gate.isEnabled("AP");
  if (!apEnabled) {
    sectionsExcluded.push({ module: "AP", section: "cost_series", reason: "TENANT_MODULE_DISABLED" });
  } else if (canViewProjectCashFlowReport(ctx.roles) || can(ctx.roles, "VIEW", "AP")) {
    const [payments, invoices, subCertLines] = await Promise.all([
      prisma.payment.findMany({
        where: {
          tenantId: ctx.tenantId,
          projectId,
          status: "CONFIRMED",
          paymentDate: { gte: dateFrom, lte: dateTo },
        },
        select: { paymentDate: true, amount: true },
      }),
      prisma.supplierInvoice.findMany({
        where: {
          tenantId: ctx.tenantId,
          projectId,
          status: "ISSUED",
          subcontractCertificationId: null,
          issueDate: { gte: dateFrom, lte: dateTo },
        },
        select: { issueDate: true, totalAmount: true },
      }),
      gate.isEnabled("SUBCONTRACTS")
        ? prisma.subcontractCertificationLine.findMany({
            where: {
              certification: {
                projectId,
                tenantId: ctx.tenantId,
                status: "APPROVED",
                certificationDate: { gte: dateFrom, lte: dateTo },
              },
            },
            select: {
              lineTotal: true,
              certification: { select: { certificationDate: true } },
            },
          })
        : Promise.resolve([]),
    ]);

    for (const p of payments) {
      ensure(monthKey(p.paymentDate)).costPaid = ensure(monthKey(p.paymentDate)).costPaid.plus(p.amount);
    }
    for (const inv of invoices) {
      ensure(monthKey(inv.issueDate)).costAccrued = ensure(monthKey(inv.issueDate)).costAccrued.plus(
        inv.totalAmount,
      );
    }
    for (const cl of subCertLines) {
      const key = monthKey(cl.certification.certificationDate);
      ensure(key).costAccrued = ensure(key).costAccrued.plus(cl.lineTotal);
    }
  }

  warnings.push(
    "Ingresos: certificado (emisión) / facturado (AR) / cobrado (caja). Costos: devengado (facturas + cert. sub) vs pagado (caja). No mezclar capas en un solo KPI sin etiqueta.",
  );

  const series: IncomeExpensePoint[] = Array.from(monthlyMap.keys())
    .sort()
    .map((key) => {
      const b = monthlyMap.get(key)!;
      const gmAcc = b.certified.minus(b.costAccrued);
      const gmCash = b.collected.minus(b.costPaid);
      return {
        periodKey: key,
        periodLabel: monthLabel(key),
        certifiedAmount: b.certified.toFixed(2),
        invoicedAmount: b.invoiced.toFixed(2),
        collectedAmount: b.collected.toFixed(2),
        costAccrued: b.costAccrued.toFixed(2),
        costPaid: b.costPaid.toFixed(2),
        grossMarginAccrued: gmAcc.toFixed(2),
        grossMarginCash: gmCash.toFixed(2),
      };
    });

  const totals = series.reduce(
    (acc, p) => ({
      certified: acc.certified.plus(p.certifiedAmount),
      invoiced: acc.invoiced.plus(p.invoicedAmount),
      collected: acc.collected.plus(p.collectedAmount),
      costAccrued: acc.costAccrued.plus(p.costAccrued),
      costPaid: acc.costPaid.plus(p.costPaid),
    }),
    {
      certified: new Prisma.Decimal(0),
      invoiced: new Prisma.Decimal(0),
      collected: new Prisma.Decimal(0),
      costAccrued: new Prisma.Decimal(0),
      costPaid: new Prisma.Decimal(0),
    },
  );

  const gmAcc = totals.certified.minus(totals.costAccrued);
  const gmCash = totals.collected.minus(totals.costPaid);

  return {
    type: "REPORT",
    projectId,
    budgetId,
    budgetName,
    dateFrom: range.dateFrom,
    dateTo: range.dateTo,
    series,
    totals: {
      certifiedAmount: totals.certified.toFixed(2),
      invoicedAmount: totals.invoiced.toFixed(2),
      collectedAmount: totals.collected.toFixed(2),
      costAccrued: totals.costAccrued.toFixed(2),
      costPaid: totals.costPaid.toFixed(2),
      grossMarginAccrued: gmAcc.toFixed(2),
      grossMarginCash: gmCash.toFixed(2),
      grossMarginAccruedPct: pct(totals.certified, totals.costAccrued),
      grossMarginCashPct: pct(totals.collected, totals.costPaid),
    },
    warnings,
    sectionsExcluded,
  };
}
