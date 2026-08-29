import { parseTrendMonths, trendDateRange, type TrendMonths } from "../reports/report-month";
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
import { canViewCompanyFinanceHub, canViewCompanyTreasury } from "./finance-access";
import { canViewCompanyAp } from "../ap/ap-access";
import { canViewCompanyAr } from "../ar/ar-access";

export { parseTrendMonths };
export type { TrendMonths };

export type FinanceHubCharts = {
  months: TrendMonths;
  cash: CashFlowCurrency | null;
  /** True when treasury report returned more than one currency (chart shows one). */
  cashMulticurrency: boolean;
  economic: CompanyIncomeExpenseReport | null;
};

export async function getFinanceHubCharts(
  ctx: ServiceContext,
  opts?: { months?: number },
): Promise<FinanceHubCharts> {
  const months = parseTrendMonths(opts?.months);
  const gate = await getTenantModuleGate(ctx);
  const range = trendDateRange(months);

  let cash: CashFlowCurrency | null = null;
  let cashMulticurrency = false;

  if (gate.isEnabled("TREASURY") && canViewCompanyTreasury(ctx.roles)) {
    try {
      const report = await getCashFlowReport(
        { dateFrom: range.dateFrom, dateTo: range.dateTo, period: "month" },
        ctx,
      );
      if (report.length > 0) {
        cashMulticurrency = report.length > 1;
        cash = report.find((c) => c.currency === "ARS") ?? report[0]!;
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

  return { months, cash, cashMulticurrency, economic };
}
