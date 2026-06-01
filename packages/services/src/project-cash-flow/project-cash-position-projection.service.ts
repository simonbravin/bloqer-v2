import { Prisma, prisma } from "@bloqer/database";
import { toIsoDateLocal } from "@bloqer/utils";
import {
  assertTenantModuleEnabledWithGate,
  getTenantModuleGate,
} from "../tenant-modules/tenant-module.service";
import type { TenantModuleSectionExcludedWarning } from "../tenant-modules/tenant-module-report-warnings";
import { ACTIVE_OBLIGATION_STATUSES } from "../finance/obligation-status";
import { ServiceContext, ServiceError } from "../types";
import { canViewProjectCashFlowReport } from "./project-cash-flow.service";
import { computeProjectedCapital } from "./project-cash-position-projection-pure";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m! - 1 && dt.getUTCDate() === d!;
}

export function resolveProjectionAsOfDate(value: string | undefined): string {
  if (value && isValidIsoDate(value)) return value;
  return toIsoDateLocal();
}

export type ProjectCashPositionProjectionFilters = {
  asOfDate?: string;
  currency?: string;
};

export type ProjectCashPositionProjectionCurrency = {
  currency: string;
  collectionsReceived: string;
  paymentsMade: string;
  receivablesDue: string;
  payablesDue: string;
  projectedCapital: string;
  receivableOpenCount: number;
  payableOpenCount: number;
};

export type ProjectCashPositionProjectionReport = {
  type: "REPORT";
  projectId: string;
  asOfDate: string;
  currencies: ProjectCashPositionProjectionCurrency[];
  warnings: string[];
  sectionsExcluded: TenantModuleSectionExcludedWarning[];
};

const OPEN_OBLIGATION = ACTIVE_OBLIGATION_STATUSES;

/**
 * Proyección puntual de caja del proyecto a una fecha:
 * cobros/pagos confirmados hasta la fecha + saldos CxC/CxP con vencimiento ≤ fecha.
 */
export async function getProjectCashPositionProjection(
  projectId: string,
  filters: ProjectCashPositionProjectionFilters,
  ctx: ServiceContext,
): Promise<ProjectCashPositionProjectionReport> {
  if (!canViewProjectCashFlowReport(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver proyección de caja del proyecto");
  }

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new ServiceError("NOT_FOUND", "Proyecto no encontrado");
  if (project.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");

  const gate = await getTenantModuleGate(ctx);
  assertTenantModuleEnabledWithGate(gate, "PROJECTS");
  const includeAr = gate.isEnabled("AR");
  const includeAp = gate.isEnabled("AP");

  const warnings: string[] = [
    "Capital proyectado = cobros confirmados − pagos confirmados + saldo CxC (vto. ≤ fecha) − saldo CxP (vto. ≤ fecha). No incluye OC sin facturar.",
  ];
  const sectionsExcluded: TenantModuleSectionExcludedWarning[] = [];

  if (!includeAr) {
    sectionsExcluded.push({
      module: "AR",
      section: "collections_and_receivables",
      reason: "TENANT_MODULE_DISABLED",
    });
    warnings.push("AR deshabilitado: cobros y cuentas por cobrar en cero.");
  }
  if (!includeAp) {
    sectionsExcluded.push({
      module: "AP",
      section: "payments_and_payables",
      reason: "TENANT_MODULE_DISABLED",
    });
    warnings.push("AP deshabilitado: pagos y cuentas por pagar en cero.");
  }

  const asOfDate = resolveProjectionAsOfDate(filters.asOfDate);
  const asOf = new Date(asOfDate);

  const [collections, payments, receivables, payables] = await Promise.all([
    includeAr
      ? prisma.collection.findMany({
          where: {
            tenantId: ctx.tenantId,
            projectId,
            status: "CONFIRMED",
            collectionDate: { lte: asOf },
            ...(filters.currency ? { currency: filters.currency } : {}),
          },
          select: { currency: true, amount: true },
        })
      : Promise.resolve([]),
    includeAp
      ? prisma.payment.findMany({
          where: {
            tenantId: ctx.tenantId,
            projectId,
            status: "CONFIRMED",
            paymentDate: { lte: asOf },
            ...(filters.currency ? { currency: filters.currency } : {}),
          },
          select: { currency: true, amount: true },
        })
      : Promise.resolve([]),
    includeAr
      ? prisma.receivable.findMany({
          where: {
            tenantId: ctx.tenantId,
            projectId,
            status: { in: [...OPEN_OBLIGATION] },
            dueDate: { lte: asOf },
            ...(filters.currency ? { currency: filters.currency } : {}),
          },
          select: {
            currency: true,
            originalAmount: true,
            paidAmount: true,
          },
        })
      : Promise.resolve([]),
    includeAp
      ? prisma.payable.findMany({
          where: {
            tenantId: ctx.tenantId,
            projectId,
            status: { in: [...OPEN_OBLIGATION] },
            dueDate: { lte: asOf },
            ...(filters.currency ? { currency: filters.currency } : {}),
          },
          select: {
            currency: true,
            originalAmount: true,
            paidAmount: true,
          },
        })
      : Promise.resolve([]),
  ]);

  const currencies = new Set<string>([
    ...collections.map((c) => c.currency),
    ...payments.map((p) => p.currency),
    ...receivables.map((r) => r.currency),
    ...payables.map((p) => p.currency),
  ]);

  const currencyRows: ProjectCashPositionProjectionCurrency[] = [];

  for (const cur of currencies) {
    const collectionsReceived = collections
      .filter((c) => c.currency === cur)
      .reduce((s, c) => s.plus(c.amount), new Prisma.Decimal(0));

    const paymentsMade = payments
      .filter((p) => p.currency === cur)
      .reduce((s, p) => s.plus(p.amount), new Prisma.Decimal(0));

    let receivablesDue = new Prisma.Decimal(0);
    let receivableOpenCount = 0;
    for (const r of receivables.filter((x) => x.currency === cur)) {
      const balance = r.originalAmount.minus(r.paidAmount);
      if (balance.lessThanOrEqualTo(0)) continue;
      receivablesDue = receivablesDue.plus(balance);
      receivableOpenCount += 1;
    }

    let payablesDue = new Prisma.Decimal(0);
    let payableOpenCount = 0;
    for (const p of payables.filter((x) => x.currency === cur)) {
      const balance = p.originalAmount.minus(p.paidAmount);
      if (balance.lessThanOrEqualTo(0)) continue;
      payablesDue = payablesDue.plus(balance);
      payableOpenCount += 1;
    }

    const projectedCapital = computeProjectedCapital(
      collectionsReceived,
      paymentsMade,
      receivablesDue,
      payablesDue,
    );

    currencyRows.push({
      currency: cur,
      collectionsReceived: collectionsReceived.toFixed(2),
      paymentsMade: paymentsMade.toFixed(2),
      receivablesDue: receivablesDue.toFixed(2),
      payablesDue: payablesDue.toFixed(2),
      projectedCapital: projectedCapital.toFixed(2),
      receivableOpenCount,
      payableOpenCount,
    });
  }

  currencyRows.sort((a, b) =>
    a.currency === "ARS" ? -1 : b.currency === "ARS" ? 1 : a.currency.localeCompare(b.currency),
  );

  if (currencyRows.length === 0) {
    const cur = filters.currency ?? "ARS";
    currencyRows.push({
      currency: cur,
      collectionsReceived: "0.00",
      paymentsMade: "0.00",
      receivablesDue: "0.00",
      payablesDue: "0.00",
      projectedCapital: "0.00",
      receivableOpenCount: 0,
      payableOpenCount: 0,
    });
  }

  return {
    type: "REPORT",
    projectId,
    asOfDate,
    currencies: currencyRows,
    warnings,
    sectionsExcluded,
  };
}
