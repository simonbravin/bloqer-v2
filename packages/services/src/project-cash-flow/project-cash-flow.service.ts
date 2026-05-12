import { Prisma, prisma } from "@bloqer/database";
import { can } from "@bloqer/domain";
import { ServiceContext, ServiceError } from "../types";
import { assertTenantModuleEnabledWithGate, getTenantModuleGate } from "../tenant-modules/tenant-module.service";
import type { TenantModuleSectionExcludedWarning } from "../tenant-modules/tenant-module-report-warnings";

/** Project-scoped cash flow report (Phase 7D): not tenant-wide treasury; allows finance roles without VIEW PROJECTS. */
export function canViewProjectCashFlowReport(roles: ServiceContext["roles"]): boolean {
  return (
    can(roles, "VIEW", "PROJECTS") ||
    can(roles, "VIEW", "AR") ||
    can(roles, "VIEW", "AP") ||
    can(roles, "VIEW", "TREASURY")
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function contactName(c: { fantasyName: string | null; legalName: string }): string {
  return c.fantasyName ?? c.legalName;
}

function periodKey(date: Date, period: "day" | "week" | "month"): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  if (period === "day")   return `${y}-${m}-${d}`;
  if (period === "month") return `${y}-${m}`;
  const tmp = new Date(Date.UTC(y, date.getUTCMonth(), date.getUTCDate()));
  tmp.setUTCDate(tmp.getUTCDate() + 4 - (tmp.getUTCDay() || 7));
  const yr   = tmp.getUTCFullYear();
  const jan1 = new Date(Date.UTC(yr, 0, 1));
  const wk   = Math.ceil(((tmp.getTime() - jan1.getTime()) / 86400000 + 1) / 7);
  return `${yr}-W${String(wk).padStart(2, "0")}`;
}

function periodLabel(key: string, period: "day" | "week" | "month"): string {
  const parts = key.split("-");
  if (period === "day") {
    return new Date(Date.UTC(+parts[0]!, +parts[1]! - 1, +parts[2]!))
      .toLocaleDateString("es-AR");
  }
  if (period === "month") {
    return new Date(Date.UTC(+parts[0]!, +parts[1]! - 1, 1))
      .toLocaleDateString("es-AR", { month: "long", year: "numeric" });
  }
  return key;
}

function defaultDateRange(): { dateFrom: string; dateTo: string } {
  const to   = new Date();
  const from = new Date(to);
  from.setFullYear(from.getFullYear() - 1);
  return {
    dateFrom: from.toISOString().slice(0, 10),
    dateTo:   to.toISOString().slice(0, 10),
  };
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type ProjectCashFlowFilters = {
  dateFrom?: string;
  dateTo?:   string;
  period?:   "day" | "week" | "month";
  currency?: string;
};

export type CollectionDetail = {
  collectionId:  string;
  date:          string;
  clientName:    string;
  invoiceNumber: number;
  receivableId:  string;
  amount:        string;
  currency:      string;
  accountName:   string;
  notes:         string | null;
};

export type PaymentDetail = {
  paymentId:             string;
  date:                  string;
  supplierName:          string;
  supplierInvoiceNumber: number;
  payableId:             string;
  amount:                string;
  currency:              string;
  accountName:           string;
  notes:                 string | null;
};

export type ProjectCashFlowPeriod = {
  periodKey:             string;
  periodLabel:           string;
  inflows:               string;
  outflows:              string;
  netCashFlow:           string;
  cumulativeNetCashFlow: string;
};

export type ProjectCashFlowCurrency = {
  currency:      string;
  totalInflows:  string;
  totalOutflows: string;
  netCashFlow:   string;
  periods:       ProjectCashFlowPeriod[];
  collections:   CollectionDetail[];
  payments:      PaymentDetail[];
};

export type ProjectCashFlowReport = {
  project: {
    id:     string;
    name:   string;
    code:   string;
    status: string;
  };
  dateFrom: string;
  dateTo:   string;
  period:   "day" | "week" | "month";
  warnings: {
    noCollections: boolean;
    noPayments:    boolean;
    multiCurrency: boolean;
    /** Phase 12D: tenant modules disabled → sides omitted from the report (not FORBIDDEN). */
    sectionsExcluded?: TenantModuleSectionExcludedWarning[];
  };
  currencies: ProjectCashFlowCurrency[];
};

// ─── Service ──────────────────────────────────────────────────────────────────

export async function getProjectCashFlowReport(
  projectId: string,
  filters: ProjectCashFlowFilters,
  ctx: ServiceContext,
): Promise<ProjectCashFlowReport> {
  if (!canViewProjectCashFlowReport(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver flujo de caja del proyecto");
  }

  const project = await prisma.project.findUnique({
    where:  { id: projectId },
    select: { id: true, name: true, code: true, status: true, tenantId: true },
  });
  if (!project) throw new ServiceError("NOT_FOUND", "Proyecto no encontrado");
  if (project.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");

  const gate = await getTenantModuleGate(ctx);
  assertTenantModuleEnabledWithGate(gate, "PROJECTS");
  const includeAr = gate.isEnabled("AR");
  const includeAp = gate.isEnabled("AP");

  const sectionsExcluded: TenantModuleSectionExcludedWarning[] = [];
  if (!includeAr) {
    sectionsExcluded.push({
      module: "AR",
      section: "collections_inflows",
      reason:  "TENANT_MODULE_DISABLED",
    });
  }
  if (!includeAp) {
    sectionsExcluded.push({
      module: "AP",
      section: "payments_outflows",
      reason:  "TENANT_MODULE_DISABLED",
    });
  }

  const period = (filters.period ?? "month") as "day" | "week" | "month";
  const range  = filters.dateFrom && filters.dateTo
    ? { dateFrom: filters.dateFrom, dateTo: filters.dateTo }
    : defaultDateRange();

  const dateFrom = new Date(range.dateFrom);
  const dateTo   = new Date(range.dateTo);

  const [collections, payments] = await Promise.all([
    includeAr
      ? prisma.collection.findMany({
          where: {
            tenantId:  ctx.tenantId,
            projectId,
            status:    "CONFIRMED",
            collectionDate: { gte: dateFrom, lte: dateTo },
            ...(filters.currency ? { currency: filters.currency } : {}),
          },
          include: {
            clientContact: { select: { fantasyName: true, legalName: true } },
            salesInvoice:  { select: { number: true } },
            account:       { select: { name: true } },
          },
          orderBy: { collectionDate: "asc" },
        })
      : Promise.resolve([]),
    includeAp
      ? prisma.payment.findMany({
          where: {
            tenantId:  ctx.tenantId,
            projectId,
            status:    "CONFIRMED",
            paymentDate: { gte: dateFrom, lte: dateTo },
            ...(filters.currency ? { currency: filters.currency } : {}),
          },
          include: {
            payable: {
              select: {
                supplierInvoice: {
                  select: {
                    number:          true,
                    supplierContact: { select: { fantasyName: true, legalName: true } },
                  },
                },
              },
            },
            account: { select: { name: true } },
          },
          orderBy: { paymentDate: "asc" },
        })
      : Promise.resolve([]),
  ]);

  const allCurrencies = new Set([
    ...collections.map((c) => c.currency),
    ...payments.map((p) => p.currency),
  ]);

  const currencyRows: ProjectCashFlowCurrency[] = [];

  for (const cur of allCurrencies) {
    const curCollections = collections.filter((c) => c.currency === cur);
    const curPayments    = payments.filter((p) => p.currency === cur);

    const periodMap = new Map<string, { inflows: Prisma.Decimal; outflows: Prisma.Decimal }>();

    for (const c of curCollections) {
      const key      = periodKey(c.collectionDate, period);
      const existing = periodMap.get(key) ?? { inflows: new Prisma.Decimal(0), outflows: new Prisma.Decimal(0) };
      existing.inflows = existing.inflows.plus(c.amount);
      periodMap.set(key, existing);
    }
    for (const p of curPayments) {
      const key      = periodKey(p.paymentDate, period);
      const existing = periodMap.get(key) ?? { inflows: new Prisma.Decimal(0), outflows: new Prisma.Decimal(0) };
      existing.outflows = existing.outflows.plus(p.amount);
      periodMap.set(key, existing);
    }

    let cumulative = new Prisma.Decimal(0);
    const periods: ProjectCashFlowPeriod[] = Array.from(periodMap.keys())
      .sort()
      .map((key) => {
        const { inflows, outflows } = periodMap.get(key)!;
        const net = inflows.minus(outflows);
        cumulative = cumulative.plus(net);
        return {
          periodKey:             key,
          periodLabel:           periodLabel(key, period),
          inflows:               inflows.toString(),
          outflows:              outflows.toString(),
          netCashFlow:           net.toString(),
          cumulativeNetCashFlow: cumulative.toString(),
        };
      });

    const totalInflows  = curCollections.reduce((s, c) => s.plus(c.amount),  new Prisma.Decimal(0));
    const totalOutflows = curPayments.reduce(   (s, p) => s.plus(p.amount),  new Prisma.Decimal(0));

    currencyRows.push({
      currency:      cur,
      totalInflows:  totalInflows.toString(),
      totalOutflows: totalOutflows.toString(),
      netCashFlow:   totalInflows.minus(totalOutflows).toString(),
      periods,
      collections: curCollections.map((c) => ({
        collectionId:  c.id,
        date:          c.collectionDate.toISOString().slice(0, 10),
        clientName:    contactName(c.clientContact),
        invoiceNumber: c.salesInvoice.number,
        receivableId:  c.receivableId,
        amount:        c.amount.toString(),
        currency:      c.currency,
        accountName:   c.account.name,
        notes:         c.notes,
      })),
      payments: curPayments.map((p) => ({
        paymentId:             p.id,
        date:                  p.paymentDate.toISOString().slice(0, 10),
        supplierName:          contactName(p.payable.supplierInvoice.supplierContact),
        supplierInvoiceNumber: p.payable.supplierInvoice.number,
        payableId:             p.payableId,
        amount:                p.amount.toString(),
        currency:              p.currency,
        accountName:           p.account.name,
        notes:                 p.notes,
      })),
    });
  }

  currencyRows.sort((a, b) =>
    a.currency === "ARS" ? -1 : b.currency === "ARS" ? 1 : a.currency.localeCompare(b.currency)
  );

  return {
    project: {
      id:     project.id,
      name:   project.name,
      code:   project.code,
      status: project.status as string,
    },
    dateFrom: range.dateFrom,
    dateTo:   range.dateTo,
    period,
    warnings: {
      noCollections: includeAr && collections.length === 0,
      noPayments:    includeAp && payments.length === 0,
      multiCurrency: allCurrencies.size > 1,
      ...(sectionsExcluded.length > 0 ? { sectionsExcluded } : {}),
    },
    currencies: currencyRows,
  };
}
