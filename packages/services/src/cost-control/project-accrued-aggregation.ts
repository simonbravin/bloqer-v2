import { Prisma, prisma } from "@bloqer/database";
import { getTenantModuleGate } from "../tenant-modules/tenant-module.service";
import type { ServiceContext } from "../types";
import { monthKey } from "../reports/report-month";

const ZERO = new Prisma.Decimal(0);

export type ProjectAccruedFilters = {
  dateFrom?: string;
  dateTo?: string;
};

export type ProjectAccruedByMonthPoint = {
  periodKey: string;
  amount: Prisma.Decimal;
};

export type ProjectAccruedAggregation = {
  series: ProjectAccruedByMonthPoint[];
  total: Prisma.Decimal;
  warnings: string[];
};

function dateWhere(from?: string, to?: string) {
  if (!from && !to) return undefined;
  return {
    ...(from ? { gte: new Date(from) } : {}),
    ...(to ? { lte: new Date(to) } : {}),
  };
}

/** Groups dated amounts by calendar month (UTC), aligned to cost-control accrued semantics. */
export function groupAccruedAmountsByMonth(
  entries: { date: Date; amount: Prisma.Decimal }[],
): ProjectAccruedByMonthPoint[] {
  const map = new Map<string, Prisma.Decimal>();
  for (const { date, amount } of entries) {
    const key = monthKey(date);
    map.set(key, (map.get(key) ?? ZERO).plus(amount));
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([periodKey, amount]) => ({ periodKey, amount }));
}

/**
 * Project-level accrued cost by month — same sources as cost-control §D–F:
 * APPROVED subcontract cert lines + ISSUED PO-linked invoices + unallocated ISSUED invoices.
 * BR-COS-002: excludes invoices linked to subcontract certifications.
 */
export async function getProjectAccruedByMonth(
  projectId: string,
  filters: ProjectAccruedFilters,
  ctx: ServiceContext,
): Promise<ProjectAccruedAggregation> {
  const warnings: string[] = [];
  const gate = await getTenantModuleGate(ctx);
  if (!gate.isEnabled("AP")) {
    return { series: [], total: ZERO, warnings };
  }

  const dateFrom = filters.dateFrom;
  const dateTo = filters.dateTo;
  const dateFilter = dateWhere(dateFrom, dateTo);

  const [subCertLines, poLinkedInvoices, unallocatedInvoices] = await Promise.all([
    gate.isEnabled("SUBCONTRACTS")
      ? prisma.subcontractCertificationLine.findMany({
          where: {
            certification: {
              projectId,
              tenantId: ctx.tenantId,
              status: "APPROVED",
              ...(dateFilter ? { certificationDate: dateFilter } : {}),
            },
          },
          select: {
            lineTotal: true,
            certification: { select: { certificationDate: true } },
          },
        })
      : Promise.resolve([]),
    prisma.supplierInvoice.findMany({
      where: {
        projectId,
        tenantId: ctx.tenantId,
        status: "ISSUED",
        purchaseOrderId: { not: null },
        subcontractCertificationId: null,
        ...(dateFilter ? { issueDate: dateFilter } : {}),
      },
      select: { issueDate: true, totalAmount: true, amountArs: true },
    }),
    prisma.supplierInvoice.findMany({
      where: {
        projectId,
        tenantId: ctx.tenantId,
        status: "ISSUED",
        purchaseOrderId: null,
        subcontractCertificationId: null,
        ...(dateFilter ? { issueDate: dateFilter } : {}),
      },
      select: { issueDate: true, totalAmount: true, amountArs: true },
    }),
  ]);

  if (unallocatedInvoices.length > 0) {
    warnings.push(
      `${unallocatedInvoices.length} factura(s) de proveedor sin OC ni certificación de subcontrato vinculada — incluidas en devengado a nivel proyecto.`,
    );
  }

  const entries: { date: Date; amount: Prisma.Decimal }[] = [];

  for (const cl of subCertLines) {
    entries.push({
      date: cl.certification.certificationDate,
      amount: new Prisma.Decimal(cl.lineTotal),
    });
  }
  for (const inv of poLinkedInvoices) {
    const amt = inv.amountArs.greaterThan(0) ? inv.amountArs : inv.totalAmount;
    entries.push({ date: inv.issueDate, amount: new Prisma.Decimal(amt) });
  }
  for (const inv of unallocatedInvoices) {
    const amt = inv.amountArs.greaterThan(0) ? inv.amountArs : inv.totalAmount;
    entries.push({ date: inv.issueDate, amount: new Prisma.Decimal(amt) });
  }

  const series = groupAccruedAmountsByMonth(entries);
  const total = series.reduce((s, p) => s.plus(p.amount), ZERO);

  return { series, total, warnings };
}

export async function getProjectAccruedTotal(
  projectId: string,
  filters: ProjectAccruedFilters,
  ctx: ServiceContext,
): Promise<Prisma.Decimal> {
  const { total } = await getProjectAccruedByMonth(projectId, filters, ctx);
  return total;
}
