import { Prisma, prisma } from "@bloqer/database";
import { can } from "@bloqer/domain";
import { ServiceContext, ServiceError } from "../types";
import { getTenantModuleGate } from "../tenant-modules/tenant-module.service";
import type { TenantModuleSectionExcludedWarning } from "../tenant-modules/tenant-module-report-warnings";

export type CertificationReportFilters = {
  budgetId?: string;
  dateFrom?: string;
  dateTo?: string;
};

export type CertificationEvolutionPoint = {
  periodKey: string;
  periodLabel: string;
  certifiedAmount: string;
  invoicedAmount: string;
  collectedAmount: string;
};

export type CertificationProgressPoint = {
  periodKey: string;
  periodLabel: string;
  economicPct: string;
  financialPct: string;
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
  invoicedAmount: string;
  collectedAmount: string;
  paymentStatus: CertificationDerivedPaymentStatus;
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

function monthKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  return new Date(Date.UTC(+y!, +m! - 1, 1)).toLocaleDateString("es-AR", {
    month: "short",
    year: "numeric",
  });
}

function parseFilterDate(s: string, endOfDay: boolean): Date {
  return new Date(`${s}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
}

function inDateRange(d: Date, dateFrom?: string, dateTo?: string): boolean {
  if (dateFrom && d < parseFilterDate(dateFrom, false)) return false;
  if (dateTo && d > parseFilterDate(dateTo, true)) return false;
  return true;
}

function derivePaymentStatus(
  invoiced: Prisma.Decimal,
  collected: Prisma.Decimal,
  hasInvoice: boolean,
  overdue: boolean,
): CertificationDerivedPaymentStatus {
  if (!hasInvoice || invoiced.isZero()) return "NOT_INVOICED";
  if (overdue) return "OVERDUE";
  if (collected.greaterThanOrEqualTo(invoiced) && !invoiced.isZero()) return "PAID";
  if (collected.greaterThan(0)) return "PARTIAL";
  return "UNPAID";
}

async function resolveBudget(
  projectId: string,
  budgetId: string | undefined,
  ctx: ServiceContext,
): Promise<
  | { id: string; name: string; status: string; totalSalePrice: Prisma.Decimal }
  | null
> {
  const budgets = await prisma.budget.findMany({
    where: { projectId, tenantId: ctx.tenantId, status: { in: ["APPROVED", "CLOSED"] } },
    select: { id: true, name: true, status: true, totalSalePrice: true },
    orderBy: { updatedAt: "desc" },
  });
  if (budgets.length === 0) return null;
  if (budgetId) {
    const found = budgets.find((b) => b.id === budgetId);
    return found ?? null;
  }
  return budgets[0]!;
}

export async function getCertificationEvolutionReport(
  projectId: string,
  filters: CertificationReportFilters,
  ctx: ServiceContext,
): Promise<CertificationReportResult> {
  if (!can(ctx.roles, "VIEW", "CERTIFICATIONS") && !can(ctx.roles, "VIEW", "PROJECTS")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver reportes de certificaciones");
  }

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new ServiceError("NOT_FOUND", "Proyecto no encontrado");
  if (project.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");

  const budget = await resolveBudget(projectId, filters.budgetId, ctx);
  if (!budget) return { type: "NO_APPROVED_BUDGETS" };

  const gate = await getTenantModuleGate(ctx);
  const warnings: string[] = [];
  const sectionsExcluded: TenantModuleSectionExcludedWarning[] = [];

  const certsEnabled = gate.isEnabled("CERTIFICATIONS");
  if (!certsEnabled) {
    sectionsExcluded.push({
      module: "CERTIFICATIONS",
      section: "Certificaciones cliente",
      reason: "TENANT_MODULE_DISABLED",
    });
    warnings.push("Módulo de certificaciones deshabilitado: series de avance en cero.");
  }

  const arEnabled = gate.isEnabled("AR");
  if (!arEnabled) {
    sectionsExcluded.push({
      module: "AR",
      section: "Facturado y cobrado",
      reason: "TENANT_MODULE_DISABLED",
    });
    warnings.push("Módulo de cobranzas (AR) deshabilitado: facturado y cobrado en cero.");
  }

  const budgetTotalSale = budget.totalSalePrice;

  const certifications = certsEnabled
    ? await prisma.certification.findMany({
        where: {
          projectId,
          tenantId: ctx.tenantId,
          budgetId: budget.id,
          status: { in: ["ISSUED", "APPROVED"] },
        },
        select: {
          id: true,
          number: true,
          periodStart: true,
          periodEnd: true,
          status: true,
          totalAmount: true,
          salesInvoices: {
            where: { status: "ISSUED" },
            select: {
              totalAmount: true,
              receivable: {
                select: {
                  originalAmount: true,
                  paidAmount: true,
                  dueDate: true,
                  status: true,
                  collections: {
                    where: { status: "CONFIRMED" },
                    select: { amount: true },
                  },
                },
              },
            },
          },
          lines: {
            select: {
              wbsNodeId: true,
              periodAmount: true,
              physicalPct: true,
              wbsNode: { select: { code: true, name: true } },
            },
          },
        },
        orderBy: { number: "asc" },
      })
    : [];

  const invoices =
    arEnabled
      ? await prisma.salesInvoice.findMany({
          where: {
            projectId,
            tenantId: ctx.tenantId,
            status: "ISSUED",
            certification: { budgetId: budget.id },
          },
          select: { issueDate: true, totalAmount: true },
        })
      : [];

  const collections =
    arEnabled
      ? await prisma.collection.findMany({
          where: {
            projectId,
            tenantId: ctx.tenantId,
            status: "CONFIRMED",
            salesInvoice: { certification: { budgetId: budget.id } },
          },
          select: { collectionDate: true, amount: true },
        })
      : [];

  const monthlyMap = new Map<string, { certified: Prisma.Decimal; invoiced: Prisma.Decimal; collected: Prisma.Decimal }>();

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
      invoicedAmount: v.invoiced.toFixed(2),
      collectedAmount: v.collected.toFixed(2),
    }));

  let cumCertified = new Prisma.Decimal(0);
  let cumCollected = new Prisma.Decimal(0);
  let physicalWeighted = new Prisma.Decimal(0);
  let physicalWeight = new Prisma.Decimal(0);

  const progressSeries: CertificationProgressPoint[] = monthlySeries.map((p) => {
    cumCertified = cumCertified.add(p.certifiedAmount);
    cumCollected = cumCollected.add(p.collectedAmount);

    const certsInMonth = certifications.filter(
      (c) => monthKey(c.periodEnd) === p.periodKey && inDateRange(c.periodEnd, filters.dateFrom, filters.dateTo),
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
    const financialPct = budgetTotalSale.isZero()
      ? "0.00"
      : cumCollected.div(budgetTotalSale).times(100).toFixed(2);
    const physicalPct = physicalWeight.isZero()
      ? "0.00"
      : physicalWeighted.div(physicalWeight).times(100).toFixed(2);

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
    let overdue = false;

    for (const inv of cert.salesInvoices) {
      invoiced = invoiced.add(inv.totalAmount);
      const ar = inv.receivable;
      if (!ar) continue;
      for (const c of ar.collections) {
        collected = collected.add(c.amount);
      }
      const balance = ar.originalAmount.minus(ar.paidAmount);
      if (
        ar.status !== "PAID" &&
        balance.greaterThan(0) &&
        ar.dueDate < new Date()
      ) {
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
      totalAmount: cert.totalAmount.toString(),
      invoicedAmount: invoiced.toFixed(2),
      collectedAmount: collected.toFixed(2),
      paymentStatus: derivePaymentStatus(invoiced, collected, cert.salesInvoices.length > 0, overdue),
    };
  });

  const wbsLeaves = await prisma.wbsNode.findMany({
    where: { budgetId: budget.id, type: "ITEM" },
    select: {
      id: true,
      code: true,
      name: true,
      costItem: { select: { totalSalePrice: true } },
    },
    orderBy: { code: "asc" },
  });

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

  const pendingCount = vsBudget.filter((r) => parseFloat(r.pendingCertify) > 0.01).length;

  return {
    type: "REPORT",
    projectId,
    budgetId: budget.id,
    budgetName: budget.name,
    budgetStatus: budget.status,
    budgetTotalSale: budgetTotalSale.toFixed(2),
    monthlySeries,
    progressSeries,
    portfolio,
    vsBudget,
    pendingCount,
    warnings,
    sectionsExcluded,
  };
}
