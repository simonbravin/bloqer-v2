import { fmtDecimalEs } from "../dashboard/kpi-helpers";
import { defaultReportDateRange } from "../reports/report-month";
import { getTenantModuleGate } from "../tenant-modules/tenant-module.service";
import {
  getCashFlowReport,
  type CashFlowCurrency,
} from "../treasury-reports/treasury-reports.service";
import type { ServiceContext } from "../types";
import {
  getCompanyIncomeExpenseReport,
  type CompanyIncomeExpenseReport,
} from "../reports/company-income-expense.service";
import { monthKey } from "../reports/report-month";
import { canViewCompanyFinanceHub, canViewCompanyTreasury } from "./finance-access";
import { canViewCompanyAp } from "../ap/ap-access";
import { canViewCompanyAr } from "../ar/ar-access";

export type FinanceHubMonthlyNetCash = {
  currency: string;
  amount: string;
  periodKey: string;
  label: string;
};

export type FinanceHubCharts = {
  months: number;
  cash: CashFlowCurrency | null;
  /** True when treasury report returned more than one currency (chart shows one). */
  cashMulticurrency: boolean;
  currentMonthNetCash: FinanceHubMonthlyNetCash | null;
  economic: CompanyIncomeExpenseReport | null;
};

function parseMonths(value?: number): 6 | 12 {
  return value === 6 ? 6 : 12;
}

export async function getFinanceHubCharts(
  ctx: ServiceContext,
  opts?: { months?: number },
): Promise<FinanceHubCharts> {
  const months = parseMonths(opts?.months);
  const gate = await getTenantModuleGate(ctx);
  const range = defaultReportDateRange(months);

  let cash: CashFlowCurrency | null = null;
  let cashMulticurrency = false;
  let currentMonthNetCash: FinanceHubMonthlyNetCash | null = null;

  if (gate.isEnabled("TREASURY") && canViewCompanyTreasury(ctx.roles)) {
    try {
      const report = await getCashFlowReport(
        { dateFrom: range.dateFrom, dateTo: range.dateTo, period: "month" },
        ctx,
      );
      if (report.length > 0) {
        cashMulticurrency = report.length > 1;
        cash = report.find((c) => c.currency === "ARS") ?? report[0]!;
        const currentKey = monthKey(new Date());
        const bucket = cash.buckets.find((b) => b.period === currentKey);
        if (bucket) {
          currentMonthNetCash = {
            currency: cash.currency,
            amount: bucket.netOperatingCashFlow,
            periodKey: currentKey,
            label: fmtDecimalEs(bucket.netOperatingCashFlow, cash.currency),
          };
        }
      }
    } catch {
      cash = null;
    }
  }

  let economic: CompanyIncomeExpenseReport | null = null;
  // Company economic rollup — company-finance roles only (D-056).
  const canEconomic =
    canViewCompanyFinanceHub(ctx.roles)
    && (
      (gate.isEnabled("AR") && canViewCompanyAr(ctx.roles))
      || (gate.isEnabled("AP") && canViewCompanyAp(ctx.roles))
      || (gate.isEnabled("TREASURY") && canViewCompanyTreasury(ctx.roles))
    );

  if (canEconomic) {
    try {
      economic = await getCompanyIncomeExpenseReport(
        { dateFrom: range.dateFrom, dateTo: range.dateTo },
        ctx,
      );
    } catch {
      economic = null;
    }
  }

  return { months, cash, cashMulticurrency, currentMonthNetCash, economic };
}
