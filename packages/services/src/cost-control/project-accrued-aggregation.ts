import { Prisma, prisma } from "@bloqer/database";
import { can } from "@bloqer/domain";
import { requireProjectAccess } from "../security/access";
import { assertTenantModuleEnabledWithGate } from "../tenant-modules/tenant-module.service";
import { getTenantModuleGate } from "../tenant-modules/tenant-module.service";
import { ServiceError, type ServiceContext } from "../types";
import { monthKey, parseFilterDate } from "../reports/report-month";

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
    ...(from ? { gte: parseFilterDate(from, false) } : {}),
    ...(to ? { lte: parseFilterDate(to, true) } : {}),
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
  if (!can(ctx.roles, "VIEW", "AP")) throw new ServiceError("FORBIDDEN", "Sin permisos para consultar costos devengados.");
  await requireProjectAccess(projectId, ctx);
  // Subcontract certifications and supplier invoices have companyId NOT NULL.
  const companyWhere = ctx.companyId ? { companyId: ctx.companyId } : {};
  const warnings: string[] = [];
  const gate = await getTenantModuleGate(ctx);
  assertTenantModuleEnabledWithGate(gate, "PROJECTS");
  if (!gate.isEnabled("AP")) {
    return { series: [], total: ZERO, warnings };
  }

  const dateFrom = filters.dateFrom;
  const dateTo = filters.dateTo;
  const dateFilter = dateWhere(dateFrom, dateTo);

  const [subCertLines, poLinkedInvoices, unallocatedInvoices] = await Promise.all([
    gate.isEnabled("SUBCONTRACTS") && (can(ctx.roles, "VIEW", "SUBCONTRACTS") || can(ctx.roles, "VIEW", "PROJECTS"))
      ? prisma.subcontractCertificationLine.findMany({
          where: {
            certification: {
              projectId,
              tenantId: ctx.tenantId,
              ...companyWhere,
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
        ...companyWhere,
        status: "ISSUED",
        // [D-115] Factura + ND suman accrued; NC se resta (puede venir sin OC).
        documentKind: { in: ["INVOICE", "DEBIT_NOTE", "CREDIT_NOTE"] },
        purchaseOrderId: { not: null },
        subcontractCertificationId: null,
        ...(dateFilter ? { issueDate: dateFilter } : {}),
      },
      select: { issueDate: true, subtotal: true, documentKind: true },
    }),
    prisma.supplierInvoice.findMany({
      where: {
        projectId,
        tenantId: ctx.tenantId,
        ...companyWhere,
        status: "ISSUED",
        documentKind: { in: ["INVOICE", "DEBIT_NOTE", "CREDIT_NOTE"] },
        purchaseOrderId: null,
        subcontractCertificationId: null,
        ...(dateFilter ? { issueDate: dateFilter } : {}),
      },
      select: { issueDate: true, subtotal: true, documentKind: true },
    }),
  ]);

  if (unallocatedInvoices.length > 0) {
    warnings.push(
      `${unallocatedInvoices.length} comprobante(s) de proveedor sin OC ni certificación de subcontrato vinculada — incluidos en devengado a nivel proyecto.`,
    );
  }

  const entries: { date: Date; amount: Prisma.Decimal }[] = [];

  for (const cl of subCertLines) {
    entries.push({
      date: cl.certification.certificationDate,
      amount: new Prisma.Decimal(cl.lineTotal),
    });
  }
  // D-095: net subtotals (same as getProjectCostControl), not gross IVA/IIBB.
  // Currency is explicit; ARS consolidation belongs to the report consumer.
  for (const inv of poLinkedInvoices) {
    const signed =
      inv.documentKind === "CREDIT_NOTE"
        ? new Prisma.Decimal(inv.subtotal).negated()
        : new Prisma.Decimal(inv.subtotal);
    entries.push({ date: inv.issueDate, amount: signed });
  }
  for (const inv of unallocatedInvoices) {
    const signed =
      inv.documentKind === "CREDIT_NOTE"
        ? new Prisma.Decimal(inv.subtotal).negated()
        : new Prisma.Decimal(inv.subtotal);
    entries.push({ date: inv.issueDate, amount: signed });
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
