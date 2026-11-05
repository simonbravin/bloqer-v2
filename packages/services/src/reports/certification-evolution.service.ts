import { Prisma, prisma } from "@bloqer/database";
import { can } from "@bloqer/domain";
import { companyScopeFilter } from "../company-scope";
import { assertBudgetCostGraph } from "../budget/budget-cost-graph";
import { assertBudgetCurrency } from "../cost-control/comparison-currency";
import { ServiceContext, ServiceError } from "../types";
import { requireProjectAccess } from "../security/access";
import { computeObligationBalanceDue } from "../finance/obligation-balance";
import { hasOpenObligationBalance, isObligationOverdue } from "../finance/obligation-date";
import { compareDecimal } from "@bloqer/utils";
import { serializeMoneyDecimal } from "../finance/money-decimal";
import { pickPrincipalContractualBudget } from "../budget/pick-principal-budget";
import { sortByWbsCode } from "../budget/wbs-code-rules";
import { assertTenantModuleEnabledWithGate, getTenantModuleGate } from "../tenant-modules/tenant-module.service";
import type { TenantModuleSectionExcludedWarning } from "../tenant-modules/tenant-module-report-warnings";
import { certificationWeightedPhysicalPct } from "./certification-physical-pct";
import { inDateRange, monthKey, monthLabel } from "./report-month";
import { validateResourceVarianceDates } from "../resources/resource-variance-filters";

export type CertificationReportFilters = {
  budgetId?: string;
  dateFrom?: string;
  dateTo?: string;
};

export type CertificationEvolutionPoint = {
  periodKey: string;
  periodLabel: string;
  certifiedAmount: string;
  invoicedAmount: string | null;
  collectedAmount: string | null;
};

export type CertificationProgressPoint = {
  periodKey: string;
  periodLabel: string;
  economicPct: string;
  financialPct: string | null;
  physicalPct: string;
};

export type CertificationDerivedPaymentStatus =
  | "NOT_INVOICED"
  | "UNPAID"
  | "PARTIAL"
  | "PAID"
  | "OVERDUE";

export type CertificationPortfolioRow = {
  certificationId: string;
  number: number;
  code: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  totalAmount: string;
  invoicedAmount: string | null;
  collectedAmount: string | null;
  paymentStatus: CertificationDerivedPaymentStatus | null;
};

export type CertificationVsBudgetRow = {
  wbsNodeId: string;
  wbsCode: string;
  wbsName: string;
  budgetSale: string;
  certifiedCumulative: string;
  certifiedPct: string | null;
  pendingCertify: string;
};

export type CertificationEvolutionReport = {
  type: "REPORT";
  projectId: string;
  budgetId: string;
  budgetName: string;
  budgetStatus: string;
  budgetTotalSale: string;
  currency: string;
  arAvailable: boolean;
  monthlySeries: CertificationEvolutionPoint[];
  progressSeries: CertificationProgressPoint[];
  portfolio: CertificationPortfolioRow[];
  vsBudget: CertificationVsBudgetRow[];
  pendingCount: number;
  warnings: string[];
  sectionsExcluded: TenantModuleSectionExcludedWarning[];
};

export type CertificationReportEmpty = {
  type: "NO_APPROVED_BUDGETS";
};

export type CertificationReportResult = CertificationEvolutionReport | CertificationReportEmpty;

function derivePaymentStatus(
  invoiced: Prisma.Decimal,
  applied: Prisma.Decimal,
  hasInvoice: boolean,
  overdue: boolean,
): CertificationDerivedPaymentStatus {
  if (!hasInvoice || invoiced.isZero()) return "NOT_INVOICED";
  if (overdue) return "OVERDUE";
  if (applied.greaterThanOrEqualTo(invoiced)) return "PAID";
  if (applied.greaterThan(0)) return "PARTIAL";
  return "UNPAID";
}

async function resolveBudget(
  projectId: string,
  budgetId: string | undefined,
  ctx: ServiceContext,
) {
  const budgets = await prisma.budget.findMany({
    where: { projectId, tenantId: ctx.tenantId, ...companyScopeFilter(ctx), status: { in: ["APPROVED", "CLOSED"] } },
    select: {
      id: true,
      name: true,
      status: true,
      companyId: true,
      currency: true,
      totalSalePrice: true,
      versionNumber: true,
      parentBudgetId: true,
    },
  });
  if (budgets.length === 0) return null;
  const picked = budgetId
    ? budgets.find((b) => b.id === budgetId)
    : pickPrincipalContractualBudget(budgets);
  return picked ?? null;
}

export async function getCertificationEvolutionReport(
  projectId: string,
  filters: CertificationReportFilters,
  ctx: ServiceContext,
): Promise<CertificationReportResult> {
  if (!can(ctx.roles, "VIEW", "CERTIFICATIONS")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver reportes de certificaciones");
  }

  validateResourceVarianceDates(filters);
  const project = await requireProjectAccess(projectId, ctx);
  const companyId = project.companyId ?? ctx.companyId;
  const scopeCtx = { ...ctx, companyId };
  const scope = { tenantId: ctx.tenantId, projectId, ...(companyId ? { companyId } : {}) };
  const gate = await getTenantModuleGate(ctx);
  assertTenantModuleEnabledWithGate(gate, "CERTIFICATIONS");
  assertTenantModuleEnabledWithGate(gate, "BUDGETS");

  const budget = await resolveBudget(projectId, filters.budgetId, scopeCtx);
  if (!budget) return { type: "NO_APPROVED_BUDGETS" };
  await assertBudgetCostGraph(budget.id);

  const warnings: string[] = [];
  const sectionsExcluded: TenantModuleSectionExcludedWarning[] = [];

  const arAvailable = gate.isEnabled("AR") && can(ctx.roles, "VIEW", "AR");
  if (!gate.isEnabled("AR")) {
    sectionsExcluded.push({
      module: "AR",
      section: "Facturado y cobrado",
      reason: "TENANT_MODULE_DISABLED",
    });
  }
  if (!arAvailable) warnings.push("Facturación, cobranza y estado de cobro no disponibles para este reporte.");
  const certWhere = {
    tenantId: ctx.tenantId, projectId, budgetId: budget.id,
    ...companyScopeFilter({ ...scopeCtx, companyId: budget.companyId ?? companyId }),
    status: { in: ["ISSUED", "APPROVED"] as Array<"ISSUED" | "APPROVED"> },
  };
  const invoiceWhere = { ...scope, status: "ISSUED" as const, documentKind: "INVOICE" as const };

  const budgetTotalSale = budget.totalSalePrice;

  const certifications = await prisma.certification.findMany({
        where: certWhere,
        select: {
          id: true,
          companyId: true,
          number: true,
          periodStart: true,
          periodEnd: true,
          status: true,
          totalAmount: true,
          salesInvoices: {
            where: arAvailable ? invoiceWhere : { id: { in: [] } },
            select: {
              id: true, companyId: true, currency: true,
              issueDate: true,
              totalAmount: true,
              receivable: {
                select: {
                  originalAmount: true,
                  tenantId: true, companyId: true, projectId: true, currency: true,
                  paidAmount: true,
                  creditedAmount: true,
                  dueDate: true,
                  status: true,
                  collections: {
                    where: { ...scope, status: "CONFIRMED" },
                    select: { amount: true, currency: true, companyId: true, salesInvoiceId: true, collectionDate: true },
                  },
                },
              },
            },
          },
          lines: {
            where: { wbsNode: { budgetId: budget.id, type: "ITEM" } },
            select: {
              wbsNodeId: true,
              periodAmount: true,
              physicalPct: true,
              wbsNode: { select: { code: true, name: true } },
            },
          },
        },
        orderBy: { number: "asc" },
      });

  const invoiceRows = certifications.flatMap((cert) => cert.salesInvoices.filter((invoice) =>
    (cert.companyId === null || invoice.companyId === cert.companyId) &&
    (budget.companyId === null || invoice.companyId === budget.companyId),
  ));
  const invoices = invoiceRows.map((invoice) => {
    assertBudgetCurrency(budget.currency, invoice.currency);
    const ar = invoice.receivable;
    const receivable = ar?.tenantId === ctx.tenantId && ar.companyId === invoice.companyId &&
      ar.projectId === projectId && ar.currency === invoice.currency ? ar : null;
    const collections = receivable?.collections.filter((collection) =>
      collection.companyId === invoice.companyId && collection.salesInvoiceId === invoice.id,
    ) ?? [];
    for (const collection of collections) assertBudgetCurrency(budget.currency, collection.currency);
    return { ...invoice, receivable, collections };
  });
  const invoiceById = new Map(invoices.map((invoice) => [invoice.id, invoice]));
  const collections = invoices.flatMap((invoice) => invoice.collections);

  const monthlyMap = new Map<
    string,
    { certified: Prisma.Decimal; invoiced: Prisma.Decimal; collected: Prisma.Decimal }
  >();

  function ensureMonth(key: string) {
    if (!monthlyMap.has(key)) {
      monthlyMap.set(key, {
        certified: new Prisma.Decimal(0),
        invoiced: new Prisma.Decimal(0),
        collected: new Prisma.Decimal(0),
      });
    }
    return monthlyMap.get(key)!;
  }

  for (const cert of certifications) {
    const end = cert.periodEnd;
    if (!inDateRange(end, filters.dateFrom, filters.dateTo)) continue;
    const key = monthKey(end);
    ensureMonth(key).certified = ensureMonth(key).certified.add(cert.totalAmount);
  }

  for (const inv of invoices) {
    if (!inDateRange(inv.issueDate, filters.dateFrom, filters.dateTo)) continue;
    const key = monthKey(inv.issueDate);
    ensureMonth(key).invoiced = ensureMonth(key).invoiced.add(inv.totalAmount);
  }

  for (const coll of collections) {
    if (!inDateRange(coll.collectionDate, filters.dateFrom, filters.dateTo)) continue;
    const key = monthKey(coll.collectionDate);
    ensureMonth(key).collected = ensureMonth(key).collected.add(coll.amount);
  }

  const monthlySeries: CertificationEvolutionPoint[] = [...monthlyMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([periodKey, v]) => ({
      periodKey,
      periodLabel: monthLabel(periodKey),
      certifiedAmount: v.certified.toFixed(2),
      invoicedAmount: arAvailable ? v.invoiced.toFixed(2) : null,
      collectedAmount: arAvailable ? v.collected.toFixed(2) : null,
    }));

  let cumCertified = new Prisma.Decimal(0);
  let cumCollected = new Prisma.Decimal(0);
  let physicalWeighted = new Prisma.Decimal(0);
  let physicalWeight = new Prisma.Decimal(0);

  const progressSeries: CertificationProgressPoint[] = monthlySeries.map((p) => {
    cumCertified = cumCertified.add(p.certifiedAmount);
    if (p.collectedAmount !== null) cumCollected = cumCollected.add(p.collectedAmount);

    const certsInMonth = certifications.filter(
      (c) =>
        monthKey(c.periodEnd) === p.periodKey &&
        inDateRange(c.periodEnd, filters.dateFrom, filters.dateTo),
    );
    for (const cert of certsInMonth) {
      for (const line of cert.lines) {
        const sale = new Prisma.Decimal(line.periodAmount);
        if (sale.isZero()) continue;
        physicalWeighted = physicalWeighted.add(new Prisma.Decimal(line.physicalPct).mul(sale));
        physicalWeight = physicalWeight.add(sale);
      }
    }

    const economicPct = budgetTotalSale.isZero()
      ? "0.00"
      : cumCertified.div(budgetTotalSale).times(100).toFixed(2);
    const financialPct = !arAvailable ? null : budgetTotalSale.isZero()
      ? "0.00" : cumCollected.div(budgetTotalSale).times(100).toFixed(2);
    const physicalPct = certificationWeightedPhysicalPct(
      physicalWeighted.toString(),
      physicalWeight.toString(),
    );

    return {
      periodKey: p.periodKey,
      periodLabel: p.periodLabel,
      economicPct,
      financialPct,
      physicalPct,
    };
  });

  const portfolio: CertificationPortfolioRow[] = certifications.map((cert) => {
    let invoiced = new Prisma.Decimal(0);
    let collected = new Prisma.Decimal(0);
    let credits = new Prisma.Decimal(0);
    let invoiceCount = 0;
    let overdue = false;

    for (const source of cert.salesInvoices) {
      const inv = invoiceById.get(source.id);
      if (!inv) continue;
      invoiceCount += 1;
      invoiced = invoiced.add(inv.totalAmount);
      const ar = inv.receivable;
      if (!ar) continue;
      for (const c of inv.collections) {
        collected = collected.add(c.amount);
      }
      credits = credits.add(ar.creditedAmount);
      const balance = computeObligationBalanceDue(ar.originalAmount, ar.paidAmount, ar.creditedAmount);
      if (ar.status !== "PAID" && hasOpenObligationBalance(balance) && isObligationOverdue(ar.dueDate)) {
        overdue = true;
      }
    }

    return {
      certificationId: cert.id,
      number: cert.number,
      code: `CERT-${String(cert.number).padStart(3, "0")}`,
      periodStart: cert.periodStart.toISOString().slice(0, 10),
      periodEnd: cert.periodEnd.toISOString().slice(0, 10),
      status: cert.status,
      totalAmount: serializeMoneyDecimal(cert.totalAmount),
      invoicedAmount: arAvailable ? invoiced.toFixed(2) : null,
      collectedAmount: arAvailable ? collected.toFixed(2) : null,
      paymentStatus: arAvailable ? derivePaymentStatus(
        invoiced,
        collected.add(credits),
        invoiceCount > 0,
        overdue,
      ) : null,
    };
  });

  const wbsLeaves = sortByWbsCode(
    await prisma.wbsNode.findMany({
      where: { budgetId: budget.id, type: "ITEM" },
      select: {
        id: true,
        code: true,
        name: true,
        costItem: { select: { totalSalePrice: true } },
      },
    }),
  );

  const certifiedByWbs = new Map<string, Prisma.Decimal>();
  for (const cert of certifications) {
    for (const line of cert.lines) {
      const prev = certifiedByWbs.get(line.wbsNodeId) ?? new Prisma.Decimal(0);
      certifiedByWbs.set(line.wbsNodeId, prev.add(line.periodAmount));
    }
  }

  const vsBudget: CertificationVsBudgetRow[] = wbsLeaves.map((w) => {
    const sale = w.costItem?.totalSalePrice ?? new Prisma.Decimal(0);
    const certified = certifiedByWbs.get(w.id) ?? new Prisma.Decimal(0);
    const pending = sale.minus(certified);
    const pct = sale.isZero() ? null : certified.div(sale).times(100).toFixed(2);
    return {
      wbsNodeId: w.id,
      wbsCode: w.code,
      wbsName: w.name,
      budgetSale: sale.toFixed(2),
      certifiedCumulative: certified.toFixed(2),
      certifiedPct: pct,
      pendingCertify: pending.greaterThan(0) ? pending.toFixed(2) : "0.00",
    };
  });

  const pendingCount = vsBudget.filter((r) => compareDecimal(r.pendingCertify, "0.01") > 0).length;

  return {
    type: "REPORT",
    projectId,
    budgetId: budget.id,
    budgetName: budget.name,
    budgetStatus: budget.status,
    budgetTotalSale: budgetTotalSale.toFixed(2),
    currency: budget.currency,
    arAvailable,
    monthlySeries,
    progressSeries,
    portfolio,
    vsBudget,
    pendingCount,
    warnings,
    sectionsExcluded,
  };
}
