import { Prisma, prisma } from "@bloqer/database";
import { can } from "@bloqer/domain";
import { canViewProjectCostControlReport } from "../cost-control/cost-control.service";
import { getProjectAccruedByMonth } from "../cost-control/project-accrued-aggregation";
import { serializeMoneyDecimal } from "../finance/money-decimal";
import { canViewProjectCashFlowReport } from "../project-cash-flow/project-cash-flow.service";
import {
  assertTenantModuleEnabledWithGate,
  getTenantModuleGate,
} from "../tenant-modules/tenant-module.service";
import type { TenantModuleSectionExcludedWarning } from "../tenant-modules/tenant-module-report-warnings";
import { ServiceContext, ServiceError } from "../types";
import { requireProjectAccess } from "../security/access";
import { getCertificationEvolutionReport } from "./certification-evolution.service";
import { defaultReportDateRange, monthKey, monthLabel, parseFilterDate } from "./report-month";
import { canConsolidateToArs, parseCurrencyView, type CurrencyView } from "./report-currency-view";

export type IncomeExpenseFilters = {
  budgetId?: string;
  dateFrom?: string;
  dateTo?: string;
  currencyView?: CurrencyView;
};

const AMOUNT_KEYS = ["certifiedAmount", "invoicedAmount", "collectedAmount", "costAccrued", "costPaid"] as const;
type AmountKey = (typeof AMOUNT_KEYS)[number];
type Amounts = Record<AmountKey, Prisma.Decimal>;
type MarginAvailability = { accrued: boolean; cash: boolean };
export type IncomeExpenseSources = { certifications: boolean; ar: boolean; ap: boolean };

type IncomeExpenseAmounts = Record<AmountKey, string> & {
  grossMarginAccrued: string | null;
  grossMarginCash: string | null;
};

export type IncomeExpensePoint = IncomeExpenseAmounts & {
  periodKey: string;
  periodLabel: string;
};

type IncomeExpenseTotals = IncomeExpenseAmounts & {
  grossMarginAccruedPct: string | null;
  grossMarginCashPct: string | null;
};

type IncomeExpenseCurrencySlice = {
  currency: string;
  series: IncomeExpensePoint[];
  totals: IncomeExpenseTotals;
};

export type IncomeExpenseReport = {
  type: "REPORT";
  projectId: string;
  budgetId: string | null;
  budgetName: string | null;
  dateFrom: string;
  dateTo: string;
  currencyView: CurrencyView;
  displayCurrency: string;
  consolidationBlocked: boolean;
  series: IncomeExpensePoint[];
  totals: IncomeExpenseTotals;
  byCurrency: IncomeExpenseCurrencySlice[];
  sourcesAvailable: IncomeExpenseSources;
  marginAvailability: MarginAvailability;
  warnings: string[];
  sectionsExcluded: TenantModuleSectionExcludedWarning[];
};

export type IncomeExpenseByCurrency = Map<string, Map<string, Amounts>>;

const ZERO = new Prisma.Decimal(0);

function emptyAmounts(): Amounts {
  return {
    certifiedAmount: ZERO, invoicedAmount: ZERO, collectedAmount: ZERO,
    costAccrued: ZERO, costPaid: ZERO,
  };
}

export function addIncomeExpenseAmounts(
  buckets: IncomeExpenseByCurrency,
  currency: string,
  period: string,
  values: Partial<Record<AmountKey, string | Prisma.Decimal | null>>,
): void {
  const months = buckets.get(currency) ?? new Map<string, Amounts>();
  const amounts = months.get(period) ?? emptyAmounts();
  for (const key of AMOUNT_KEYS) {
    amounts[key] = amounts[key].plus(values[key] ?? ZERO);
  }
  months.set(period, amounts);
  buckets.set(currency, months);
}

function serializeAmounts(values: Amounts, margins: MarginAvailability): IncomeExpenseAmounts {
  return {
    certifiedAmount: serializeMoneyDecimal(values.certifiedAmount),
    invoicedAmount: serializeMoneyDecimal(values.invoicedAmount),
    collectedAmount: serializeMoneyDecimal(values.collectedAmount),
    costAccrued: serializeMoneyDecimal(values.costAccrued),
    costPaid: serializeMoneyDecimal(values.costPaid),
    grossMarginAccrued: margins.accrued ? serializeMoneyDecimal(values.certifiedAmount.minus(values.costAccrued)) : null,
    grossMarginCash: margins.cash ? serializeMoneyDecimal(values.collectedAmount.minus(values.costPaid)) : null,
  };
}

export function resolveIncomeExpenseRange(filters: Pick<IncomeExpenseFilters, "dateFrom" | "dateTo">) {
  for (const value of [filters.dateFrom, filters.dateTo]) {
    if (value === undefined) continue;
    const date = parseFilterDate(value, false);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
      throw new ServiceError("VALIDATION", "Usá fechas válidas para ingresos vs gastos.");
    }
  }
  const defaults = defaultReportDateRange(12, filters.dateTo ? new Date(`${filters.dateTo}T12:00:00Z`) : undefined);
  const dateFrom = filters.dateFrom ?? defaults.dateFrom;
  const dateTo = filters.dateTo ?? defaults.dateTo;
  if (dateFrom > dateTo) throw new ServiceError("VALIDATION", "La fecha desde debe ser anterior o igual a la fecha hasta.");
  return { dateFrom, dateTo };
}

function pct(revenue: Prisma.Decimal, cost: Prisma.Decimal): string | null {
  return revenue.isZero() ? null : revenue.minus(cost).div(revenue).times(100).toFixed(2);
}

export function buildIncomeExpenseSlice(
  currency: string,
  months: Map<string, Amounts> | undefined,
  margins: MarginAvailability,
): IncomeExpenseCurrencySlice {
  const totals = emptyAmounts();
  const series = [...(months ?? [])]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([periodKey, amounts]) => {
      for (const key of AMOUNT_KEYS) totals[key] = totals[key].plus(amounts[key]);
      return { periodKey, periodLabel: monthLabel(periodKey), ...serializeAmounts(amounts, margins) };
    });
  return {
    currency,
    series,
    totals: {
      ...serializeAmounts(totals, margins),
      grossMarginAccruedPct: margins.accrued ? pct(totals.certifiedAmount, totals.costAccrued) : null,
      grossMarginCashPct: margins.cash ? pct(totals.collectedAmount, totals.costPaid) : null,
    },
  };
}

export async function getProjectIncomeExpenseReport(
  projectId: string,
  filters: IncomeExpenseFilters,
  ctx: ServiceContext,
): Promise<IncomeExpenseReport> {
  if (!canViewProjectCostControlReport(ctx.roles) && !canViewProjectCashFlowReport(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver ingresos vs gastos");
  }
  const project = await requireProjectAccess(projectId, ctx);

  const range = resolveIncomeExpenseRange(filters);
  const currencyView = parseCurrencyView(filters.currencyView);
  const gate = await getTenantModuleGate(ctx);
  assertTenantModuleEnabledWithGate(gate, "PROJECTS");

  const warnings: string[] = [];
  const sectionsExcluded: TenantModuleSectionExcludedWarning[] = [];
  const buckets: IncomeExpenseByCurrency = new Map();
  let budgetId: string | null = null;
  let budgetName: string | null = null;
  let budgetCurrency: string | null = null;
  let certificationAvailable = false;
  let arAvailable = false;

  if (gate.isEnabled("CERTIFICATIONS") && gate.isEnabled("BUDGETS") && can(ctx.roles, "VIEW", "CERTIFICATIONS")) {
    const certReport = await getCertificationEvolutionReport(projectId, { budgetId: filters.budgetId, ...range }, ctx);
    if (certReport.type === "REPORT") {
      budgetId = certReport.budgetId;
      budgetName = certReport.budgetName;
      budgetCurrency = certReport.currency;
      certificationAvailable = true;
      arAvailable = certReport.arAvailable;
      for (const point of certReport.monthlySeries) {
        addIncomeExpenseAmounts(buckets, certReport.currency, point.periodKey, point);
      }
      warnings.push(...certReport.warnings);
      sectionsExcluded.push(...certReport.sectionsExcluded);
    }
  } else if (!gate.isEnabled("CERTIFICATIONS") || !gate.isEnabled("BUDGETS")) {
    sectionsExcluded.push({
      module: gate.isEnabled("CERTIFICATIONS") ? "BUDGETS" : "CERTIFICATIONS",
      section: "income_series",
      reason: "TENANT_MODULE_DISABLED",
    });
  } else {
    sectionsExcluded.push({ module: "CERTIFICATIONS", section: "income_series", reason: "MISSING_PERMISSION" });
  }
  if (!certificationAvailable) warnings.push("Ingresos certificados fuera del cálculo: la fuente o el presupuesto no están disponibles.");

  const apEnabled = gate.isEnabled("AP") && can(ctx.roles, "VIEW", "AP");
  if (!apEnabled) {
    sectionsExcluded.push({
      module: "AP",
      section: "cost_series",
      reason: gate.isEnabled("AP") ? "MISSING_PERMISSION" : "TENANT_MODULE_DISABLED",
    });
    warnings.push("Costos devengados y pagos fuera del cálculo: la fuente de Cuentas por pagar no está disponible.");
  } else {
    const companyId = project.companyId ?? ctx.companyId;
    const scope = { tenantId: ctx.tenantId, projectId, ...(companyId ? { companyId } : {}) };
    const [payments, accrued] = await Promise.all([
      prisma.payment.findMany({
        where: {
          ...scope,
          status: "CONFIRMED",
          supplierInvoice: scope,
          paymentDate: { gte: parseFilterDate(range.dateFrom, false), lte: parseFilterDate(range.dateTo, true) },
        },
        select: { paymentDate: true, amount: true, currency: true },
      }),
      getProjectAccruedByMonth(projectId, range, ctx),
    ]);
    for (const payment of payments) {
      addIncomeExpenseAmounts(buckets, payment.currency, monthKey(payment.paymentDate), { costPaid: payment.amount });
    }
    for (const { currency, series } of accrued.byCurrency) {
      for (const point of series) {
        addIncomeExpenseAmounts(buckets, currency, point.periodKey, { costAccrued: point.amount });
      }
    }
    warnings.push(...accrued.warnings);
  }

  const currencies = new Set([...buckets.keys(), ...(budgetCurrency ? [budgetCurrency] : [])]);
  const consolidationBlocked = currencyView === "ARS" && !canConsolidateToArs(currencies);
  if (consolidationBlocked) {
    warnings.push("Vista ARS no consolidable con las fuentes disponibles. Los importes se muestran por moneda original.");
  }
  if (currencies.size > 1) {
    warnings.push("Hay importes en monedas distintas. Los márgenes quedan sin calcular.");
  }
  const marginAvailability = {
    accrued: certificationAvailable && apEnabled && currencies.size <= 1,
    cash: arAvailable && apEnabled && currencies.size <= 1,
  };
  const displayCurrency = budgetCurrency ?? (currencies.has("ARS") ? "ARS" : [...currencies].sort()[0] ?? "ARS");
  const byCurrency = [...currencies].sort().map((currency) =>
    buildIncomeExpenseSlice(currency, buckets.get(currency), marginAvailability),
  );
  const selected = byCurrency.find((slice) => slice.currency === displayCurrency)
    ?? buildIncomeExpenseSlice(displayCurrency, undefined, marginAvailability);

  return {
    type: "REPORT",
    projectId,
    budgetId,
    budgetName,
    ...range,
    currencyView,
    displayCurrency,
    consolidationBlocked,
    series: selected.series,
    totals: selected.totals,
    byCurrency,
    sourcesAvailable: { certifications: certificationAvailable, ar: arAvailable, ap: apEnabled },
    marginAvailability,
    warnings,
    sectionsExcluded,
  };
}
