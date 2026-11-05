import { Prisma, prisma } from "@bloqer/database";
import { can } from "@bloqer/domain";
import { verifiedDocumentAmountArs } from "../finance/fx-amount.service";
import { assertOverheadCompanyScope, assertOverheadView } from "../finance/overhead-access";
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
  total: Prisma.Decimal | null;
  totalArs: Prisma.Decimal | null;
  missingArsCount: number;
  byCurrency: { currency: string; series: ProjectAccruedByMonthPoint[] }[];
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
  const project = await requireProjectAccess(projectId, ctx);
  return readProjectAccruedByMonth(projectId, filters, { ...ctx, companyId: project.companyId ?? ctx.companyId }, prisma);
}

/** Internal input to the full company denominator in D-043. Callers redact per-project results for preview. */
export async function loadCompanyAccruedForOverhead(
  projectId: string,
  companyId: string,
  filters: ProjectAccruedFilters,
  ctx: ServiceContext,
  db: Prisma.TransactionClient,
): Promise<{ totalArs: Prisma.Decimal | null; missingArsCount: number }> {
  assertOverheadView(ctx);
  assertOverheadCompanyScope(companyId, ctx);
  const { totalArs, missingArsCount } = await readProjectAccruedByMonth(projectId, filters, { ...ctx, companyId }, db, companyId);
  return { totalArs, missingArsCount };
}

async function readProjectAccruedByMonth(
  projectId: string,
  filters: ProjectAccruedFilters,
  ctx: ServiceContext,
  db: Prisma.TransactionClient,
  exactProjectCompanyId?: string,
): Promise<ProjectAccruedAggregation> {
  // Subcontract certifications and supplier invoices have companyId NOT NULL.
  const companyWhere = ctx.companyId ? { companyId: ctx.companyId } : {};
  const rootWhere = {
    projectId, tenantId: ctx.tenantId, ...companyWhere,
    project: { tenantId: ctx.tenantId, ...(exactProjectCompanyId ? { companyId: exactProjectCompanyId } : {}) },
  };
  const warnings: string[] = [];
  const gate = await getTenantModuleGate(ctx);
  assertTenantModuleEnabledWithGate(gate, "PROJECTS");
  if (!gate.isEnabled("AP")) {
    return { series: [], total: ZERO, totalArs: null, missingArsCount: 0, byCurrency: [], warnings };
  }

  const dateFrom = filters.dateFrom;
  const dateTo = filters.dateTo;
  const dateFilter = dateWhere(dateFrom, dateTo);

  const [subCertLines, poLinkedInvoices, unallocatedInvoices] = await Promise.all([
    gate.isEnabled("SUBCONTRACTS") && (can(ctx.roles, "VIEW", "SUBCONTRACTS") || can(ctx.roles, "VIEW", "PROJECTS"))
      ? db.subcontractCertificationLine.findMany({
          where: {
            certification: {
              ...rootWhere,
              status: "APPROVED",
              subcontract: { tenantId: ctx.tenantId, projectId, ...companyWhere },
              ...(dateFilter ? { certificationDate: dateFilter } : {}),
            },
          },
          select: {
            lineTotal: true,
            certification: { select: { certificationDate: true, companyId: true, subcontractId: true, subcontract: { select: { companyId: true, currency: true } } } },
            subcontractLine: { select: { subcontractId: true } },
          },
        })
      : Promise.resolve([]),
    db.supplierInvoice.findMany({
      where: {
        ...rootWhere,
        status: "ISSUED",
        // [D-115] Factura + ND suman accrued; NC se resta (puede venir sin OC).
        documentKind: { in: ["INVOICE", "DEBIT_NOTE", "CREDIT_NOTE"] },
        purchaseOrderId: { not: null },
        subcontractCertificationId: null,
        ...(dateFilter ? { issueDate: dateFilter } : {}),
      },
      select: { issueDate: true, subtotal: true, totalAmount: true, amountArs: true, fxRate: true, documentKind: true, currency: true },
    }),
    db.supplierInvoice.findMany({
      where: {
        ...rootWhere,
        status: "ISSUED",
        documentKind: { in: ["INVOICE", "DEBIT_NOTE", "CREDIT_NOTE"] },
        purchaseOrderId: null,
        subcontractCertificationId: null,
        ...(dateFilter ? { issueDate: dateFilter } : {}),
      },
      select: { issueDate: true, subtotal: true, totalAmount: true, amountArs: true, fxRate: true, documentKind: true, currency: true },
    }),
  ]);

  if (unallocatedInvoices.length > 0) {
    warnings.push(
      `${unallocatedInvoices.length} comprobante(s) de proveedor sin OC ni certificación de subcontrato vinculada — incluidos en devengado a nivel proyecto.`,
    );
  }

  const entries: { date: Date; amount: Prisma.Decimal; currency: string }[] = [];
  let totalArs = ZERO;
  let missingArsCount = 0;

  for (const cl of subCertLines) {
    if (cl.certification.companyId !== cl.certification.subcontract.companyId || cl.certification.subcontractId !== cl.subcontractLine.subcontractId) {
      throw new ServiceError("CONFLICT", "Hay certificaciones de subcontrato con vínculos inconsistentes en el costo devengado.");
    }
    const currency = cl.certification.subcontract.currency.trim().toUpperCase();
    if (currency === "ARS") totalArs = totalArs.plus(cl.lineTotal);
    else if (!cl.lineTotal.isZero()) missingArsCount += 1;
    entries.push({
      date: cl.certification.certificationDate,
      amount: cl.lineTotal,
      currency,
    });
  }
  // D-095: net subtotals (same as getProjectCostControl), not gross IVA/IIBB.
  // Currency is explicit; ARS consolidation belongs to the report consumer.
  for (const inv of [...poLinkedInvoices, ...unallocatedInvoices]) {
    const credit = inv.documentKind === "CREDIT_NOTE";
    const equivalent = verifiedDocumentAmountArs(inv, inv.subtotal);
    if (equivalent === null) missingArsCount += 1;
    else totalArs = totalArs.plus(credit ? equivalent.negated() : equivalent);
    entries.push({ date: inv.issueDate, amount: credit ? inv.subtotal.negated() : inv.subtotal, currency: inv.currency.trim().toUpperCase() });
  }

  const entriesByCurrency = new Map<string, typeof entries>();
  for (const entry of entries) {
    const rows = entriesByCurrency.get(entry.currency) ?? [];
    rows.push(entry);
    entriesByCurrency.set(entry.currency, rows);
  }
  const byCurrency = [...entriesByCurrency].map(([currency, rows]) => ({
    currency,
    series: groupAccruedAmountsByMonth(rows),
  }));
  const series = byCurrency.length === 1 ? byCurrency[0]!.series : [];
  const total = byCurrency.length <= 1 ? series.reduce((s, p) => s.plus(p.amount), ZERO) : null;

  return { series, total, totalArs: missingArsCount === 0 ? totalArs : null, missingArsCount, byCurrency, warnings };
}

export async function getProjectAccruedTotal(
  projectId: string,
  filters: ProjectAccruedFilters,
  ctx: ServiceContext,
): Promise<Prisma.Decimal> {
  const { total } = await getProjectAccruedByMonth(projectId, filters, ctx);
  if (total === null) throw new ServiceError("VALIDATION", "El costo devengado está en más de una moneda.");
  return total;
}
