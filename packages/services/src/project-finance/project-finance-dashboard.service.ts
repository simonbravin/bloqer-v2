import type { DashboardKpi } from "../dashboard/tenant-dashboard.service";
import { fmtDecimalEs } from "../dashboard/kpi-helpers";
import { getProjectFinanceOverview, type ProjectFinanceOverview } from "./project-finance-overview.service";
import { getProjectIncomeExpenseReport, type IncomeExpenseReport } from "../reports/project-income-expense.service";
import {
  getProjectCashProjectionReport,
  type CashProjectionReport,
} from "../reports/project-cash-projection.service";
import {
  getProcurementDeviationReport,
  type ProcurementReportResult,
} from "../reports/procurement-deviation.service";
import { getProjectProfitabilityKpi } from "../reports/project-profitability.service";
import {
  getProjectCostCompositionReport,
  type ProjectCostCompositionResult,
} from "./project-cost-composition.service";
import {
  getProjectWbsProgressAlerts,
  type ProjectWbsProgressResult,
} from "./project-wbs-progress-alerts.service";
import {
  getProjectCashFlowReport,
  type ProjectCashFlowReport,
} from "../project-cash-flow/project-cash-flow.service";
import { defaultReportDateRange } from "../reports/report-month";
import type { ServiceContext } from "../types";

export type ProjectFinanceMonthBalance = {
  periodLabel: string;
  certifiedAmount: string;
  costAccrued: string;
  grossMarginAccrued: string;
  collectedAmount: string;
  costPaid: string;
  grossMarginCash: string;
  currency: string;
};

export type ProjectFinanceMonthCashFlow = {
  periodLabel: string;
  inflows: string;
  outflows: string;
  netCashFlow: string;
  currency: string;
};

export type ProjectFinanceTopSupplier = {
  supplierContactId: string;
  supplierName: string;
  accruedCost: string;
  paidCost: string;
  openCommitted: string;
};

export type ProjectFinanceDashboard = {
  overview: ProjectFinanceOverview;
  kpis: DashboardKpi[];
  monthBalance: ProjectFinanceMonthBalance | null;
  monthCashFlow: ProjectFinanceMonthCashFlow | null;
  incomeExpense: IncomeExpenseReport | null;
  cashFlow: ProjectCashFlowReport | null;
  cashProjection: CashProjectionReport | null;
  topSuppliers: ProjectFinanceTopSupplier[];
  costComposition: ProjectCostCompositionResult | null;
  wbsAlerts: ProjectWbsProgressResult | null;
  months: number;
};

export async function getProjectFinanceDashboard(
  ctx: ServiceContext,
  projectId: string,
  opts?: { months?: number; budgetId?: string },
): Promise<ProjectFinanceDashboard> {
  const months = opts?.months === 6 ? 6 : 12;
  const range = defaultReportDateRange(months);
  const budgetFilter = { budgetId: opts?.budgetId };

  const overview = await getProjectFinanceOverview(ctx, projectId);

  const [
    incomeExpense,
    cashFlow,
    cashProjection,
    procurement,
    profitability,
    costComposition,
    wbsAlerts,
  ] = await Promise.all([
    safeIncomeExpense(projectId, range, ctx),
    safeCashFlow(projectId, range, ctx),
    safeCashProjection(projectId, ctx),
    safeProcurement(projectId, budgetFilter, ctx),
    safeProfitability(projectId, ctx),
    safeCostComposition(projectId, budgetFilter, ctx),
    safeWbsAlerts(projectId, budgetFilter, ctx),
  ]);

  const monthBalance = deriveMonthBalance(incomeExpense);
  const monthCashFlow = deriveMonthCashFlow(cashFlow);

  const kpis: DashboardKpi[] = [];

  if (overview.sections.ar?.canView && overview.sections.ar.totalReceivableByCurrency.length > 0) {
    const first = overview.sections.ar.totalReceivableByCurrency[0]!;
    kpis.push({
      key: "p_ar_open",
      label: "C×C abiertas",
      value: fmtDecimalEs(first.amount, first.currency),
      href: overview.sections.ar.links.receivables,
    });
  }

  if (overview.sections.ap?.canView && overview.sections.ap.totalPayableByCurrency.length > 0) {
    const first = overview.sections.ap.totalPayableByCurrency[0]!;
    kpis.push({
      key: "p_ap_open",
      label: "C×P abiertas",
      value: fmtDecimalEs(first.amount, first.currency),
      href: overview.sections.ap.links.payables,
    });
  }

  if (profitability) {
    kpis.push({
      key: "p_gross_margin",
      label: "Margen bruto",
      value: fmtDecimalEs(profitability.grossMargin, profitability.currency),
      href: `/proyectos/${projectId}/reportes/rentabilidad`,
      helper: profitability.grossMarginPct ? `${profitability.grossMarginPct}%` : undefined,
    });
  }

  const topSuppliers =
    procurement && procurement.type === "REPORT"
      ? [...procurement.bySupplier]
          .sort((a, b) => parseFloat(b.accruedCost) - parseFloat(a.accruedCost))
          .slice(0, 5)
          .map((s) => ({
            supplierContactId: s.supplierContactId,
            supplierName: s.supplierName,
            accruedCost: s.accruedCost,
            paidCost: s.paidCost,
            openCommitted: s.openCommitted,
          }))
      : [];

  return {
    overview,
    kpis,
    monthBalance,
    monthCashFlow,
    incomeExpense,
    cashFlow,
    cashProjection,
    topSuppliers,
    costComposition,
    wbsAlerts,
    months,
  };
}

function deriveMonthBalance(report: IncomeExpenseReport | null): ProjectFinanceMonthBalance | null {
  if (!report || report.series.length === 0) return null;
  const last = report.series[report.series.length - 1]!;
  return {
    periodLabel: last.periodLabel,
    certifiedAmount: last.certifiedAmount,
    costAccrued: last.costAccrued,
    grossMarginAccrued: last.grossMarginAccrued,
    collectedAmount: last.collectedAmount,
    costPaid: last.costPaid,
    grossMarginCash: last.grossMarginCash,
    currency: report.displayCurrency,
  };
}

function deriveMonthCashFlow(report: ProjectCashFlowReport | null): ProjectFinanceMonthCashFlow | null {
  if (!report) return null;
  const cur = report.currencies.find((c) => c.currency === "ARS") ?? report.currencies[0];
  if (!cur || cur.periods.length === 0) return null;
  const last = cur.periods[cur.periods.length - 1]!;
  return {
    periodLabel: last.periodLabel,
    inflows: last.inflows,
    outflows: last.outflows,
    netCashFlow: last.netCashFlow,
    currency: cur.currency,
  };
}

async function safeCashFlow(
  projectId: string,
  range: { dateFrom: string; dateTo: string },
  ctx: ServiceContext,
): Promise<ProjectCashFlowReport | null> {
  try {
    return await getProjectCashFlowReport(
      projectId,
      { dateFrom: range.dateFrom, dateTo: range.dateTo, period: "month" },
      ctx,
    );
  } catch {
    return null;
  }
}

async function safeIncomeExpense(
  projectId: string,
  range: { dateFrom: string; dateTo: string },
  ctx: ServiceContext,
): Promise<IncomeExpenseReport | null> {
  try {
    return await getProjectIncomeExpenseReport(
      projectId,
      { dateFrom: range.dateFrom, dateTo: range.dateTo },
      ctx,
    );
  } catch {
    return null;
  }
}

async function safeCashProjection(
  projectId: string,
  ctx: ServiceContext,
): Promise<CashProjectionReport | null> {
  try {
    return await getProjectCashProjectionReport(projectId, {}, ctx);
  } catch {
    return null;
  }
}

async function safeProcurement(
  projectId: string,
  filters: { budgetId?: string },
  ctx: ServiceContext,
): Promise<ProcurementReportResult | null> {
  try {
    return await getProcurementDeviationReport(projectId, filters, ctx);
  } catch {
    return null;
  }
}

async function safeProfitability(projectId: string, ctx: ServiceContext) {
  try {
    return await getProjectProfitabilityKpi(projectId, ctx);
  } catch {
    return null;
  }
}

async function safeCostComposition(
  projectId: string,
  filters: { budgetId?: string },
  ctx: ServiceContext,
): Promise<ProjectCostCompositionResult | null> {
  try {
    return await getProjectCostCompositionReport(projectId, filters, ctx);
  } catch {
    return null;
  }
}

async function safeWbsAlerts(
  projectId: string,
  filters: { budgetId?: string },
  ctx: ServiceContext,
): Promise<ProjectWbsProgressResult | null> {
  try {
    return await getProjectWbsProgressAlerts(projectId, filters, ctx);
  } catch {
    return null;
  }
}
