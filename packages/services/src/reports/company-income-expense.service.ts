import { prisma } from "@bloqer/database";
import { canViewCompanyAp } from "../ap/ap-access";
import { canViewCompanyAr } from "../ar/ar-access";
import { canViewCompanyFinanceHub } from "../finance/finance-access";
import { projectRowIdWhereForScope, resolveAccessibleProjectScope } from "../security/access";
import { getTenantModuleGate } from "../tenant-modules/tenant-module.service";
import { ServiceContext, ServiceError } from "../types";
import {
  addIncomeExpenseAmounts,
  buildIncomeExpenseSlice,
  getProjectIncomeExpenseReport,
  resolveIncomeExpenseRange,
  type IncomeExpenseByCurrency,
  type IncomeExpensePoint,
  type IncomeExpenseSources,
} from "./project-income-expense.service";
import { monthKey, parseFilterDate } from "./report-month";

export type CompanyIncomeExpenseFilters = {
  dateFrom?: string;
  dateTo?: string;
};

export type CompanyIncomeExpenseReport = {
  type: "REPORT";
  dateFrom: string;
  dateTo: string;
  projectCount: number;
  displayCurrency: string | null;
  series: IncomeExpensePoint[];
  warnings: string[];
  consolidationNote: string | null;
  sourcesAvailable: IncomeExpenseSources;
};

export async function getCompanyIncomeExpenseReport(
  filters: CompanyIncomeExpenseFilters,
  ctx: ServiceContext,
): Promise<CompanyIncomeExpenseReport> {
  if (!canViewCompanyFinanceHub(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para reporte económico consolidado");
  }

  const gate = await getTenantModuleGate(ctx);
  const apAvailable = gate.isEnabled("AP") && canViewCompanyAp(ctx.roles);
  const arAvailable = gate.isEnabled("AR") && canViewCompanyAr(ctx.roles);
  if (!gate.isEnabled("PROJECTS") && !arAvailable && !apAvailable) {
    throw new ServiceError("FORBIDDEN", "Sin módulos para reporte económico consolidado");
  }

  const range = resolveIncomeExpenseRange(filters);
  const buckets: IncomeExpenseByCurrency = new Map();
  const warnings: string[] = [];
  let projectCount = 0;
  const margins = { accrued: apAvailable, cash: apAvailable && arAvailable };
  const sourcesAvailable = { certifications: false, ar: false, ap: apAvailable };

  if (gate.isEnabled("PROJECTS") && (apAvailable || arAvailable)) {
    const scope = await resolveAccessibleProjectScope(ctx);
    const projects = await prisma.project.findMany({
      where: {
        tenantId: ctx.tenantId,
        status: { not: "CANCELLED" },
        ...projectRowIdWhereForScope(scope),
      },
      select: { id: true },
    });
    projectCount = projects.length;
    const reports = await Promise.allSettled(
      projects.map((project) => getProjectIncomeExpenseReport(project.id, { ...range, currencyView: "original" }, ctx)),
    );
    for (const outcome of reports) {
      if (outcome.status === "rejected") {
        margins.accrued = false;
        margins.cash = false;
        continue;
      }
      margins.accrued &&= outcome.value.marginAvailability.accrued;
      margins.cash &&= outcome.value.marginAvailability.cash;
      sourcesAvailable.certifications ||= outcome.value.sourcesAvailable.certifications;
      sourcesAvailable.ar ||= outcome.value.sourcesAvailable.ar;
      for (const { currency, series } of outcome.value.byCurrency) {
        for (const point of series) addIncomeExpenseAmounts(buckets, currency, point.periodKey, point);
      }
    }
    const incomplete = reports.filter((outcome) => outcome.status === "rejected").length;
    if (incomplete > 0) warnings.push("La tendencia muestra resultados parciales: no se pudieron consultar todas las obras visibles.");
  }

  if (apAvailable) {
    const scope = { tenantId: ctx.tenantId, projectId: null, ...(ctx.companyId ? { companyId: ctx.companyId } : {}) };
    const date = { gte: parseFilterDate(range.dateFrom, false), lte: parseFilterDate(range.dateTo, true) };
    const [payments, invoices] = await Promise.all([
      prisma.payment.findMany({
        where: { ...scope, supplierInvoice: scope, status: "CONFIRMED", paymentDate: date },
        select: { paymentDate: true, amount: true, currency: true },
      }),
      prisma.supplierInvoice.findMany({
        where: {
          ...scope,
          status: "ISSUED",
          documentKind: { in: ["INVOICE", "DEBIT_NOTE", "CREDIT_NOTE"] },
          issueDate: date,
        },
        select: { issueDate: true, totalAmount: true, documentKind: true, currency: true },
      }),
    ]);
    for (const payment of payments) {
      addIncomeExpenseAmounts(buckets, payment.currency, monthKey(payment.paymentDate), { costPaid: payment.amount });
    }
    for (const invoice of invoices) {
      const costAccrued = invoice.documentKind === "CREDIT_NOTE" ? invoice.totalAmount.negated() : invoice.totalAmount;
      addIncomeExpenseAmounts(buckets, invoice.currency, monthKey(invoice.issueDate), { costAccrued });
    }
  }

  const currencies = [...buckets.keys()].sort();
  const displayCurrency = buckets.has("ARS") ? "ARS" : currencies[0] ?? null;
  const consolidationNote = currencies.length > 1
    ? "La tendencia muestra solo " + displayCurrency + ". Hay movimientos en " + currencies.join(", ") + " y los márgenes consolidados quedan sin calcular."
    : null;
  const series = displayCurrency === null ? [] : buildIncomeExpenseSlice(displayCurrency, buckets.get(displayCurrency), {
    accrued: margins.accrued && sourcesAvailable.certifications && currencies.length <= 1,
    cash: margins.cash && sourcesAvailable.ar && currencies.length <= 1,
  }).series;

  return { type: "REPORT", ...range, projectCount, displayCurrency, series, warnings, consolidationNote, sourcesAvailable };
}
