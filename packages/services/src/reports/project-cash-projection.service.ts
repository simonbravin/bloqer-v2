import { Prisma, prisma } from "@bloqer/database";
import { canViewProjectCashFlowReport } from "../project-cash-flow/project-cash-flow.service";
import {
  assertTenantModuleEnabledWithGate,
  getTenantModuleGate,
} from "../tenant-modules/tenant-module.service";
import type { TenantModuleSectionExcludedWarning } from "../tenant-modules/tenant-module-report-warnings";
import { ServiceContext, ServiceError } from "../types";
import { ACTIVE_OBLIGATION_STATUSES } from "../finance/obligation-status";
import { monthLabel, projectionBucketKey, projectionHorizon } from "./report-month";

export type CashProjectionFilters = {
  dateFrom?: string;
  dateTo?: string;
  currency?: string;
};

export type CashProjectionBucket = {
  periodKey: string;
  periodLabel: string;
  expectedInflows: string;
  expectedOutflows: string;
  netExpected: string;
};

export type CashProjectionCurrency = {
  currency: string;
  totalExpectedInflows: string;
  totalExpectedOutflows: string;
  netExpected: string;
  buckets: CashProjectionBucket[];
  receivableOpenCount: number;
  payableOpenCount: number;
};

export type CashProjectionReport = {
  type: "REPORT";
  projectId: string;
  dateFrom: string;
  dateTo: string;
  currencies: CashProjectionCurrency[];
  warnings: string[];
  sectionsExcluded: TenantModuleSectionExcludedWarning[];
};

const OPEN_OBLIGATION = ACTIVE_OBLIGATION_STATUSES;

export async function getProjectCashProjectionReport(
  projectId: string,
  filters: CashProjectionFilters,
  ctx: ServiceContext,
): Promise<CashProjectionReport> {
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

  const warnings: string[] = [];
  const sectionsExcluded: TenantModuleSectionExcludedWarning[] = [];
  if (!includeAr) {
    sectionsExcluded.push({
      module: "AR",
      section: "expected_collections",
      reason: "TENANT_MODULE_DISABLED",
    });
    warnings.push("AR deshabilitado: cobros esperados en cero.");
  }
  if (!includeAp) {
    sectionsExcluded.push({
      module: "AP",
      section: "expected_payments",
      reason: "TENANT_MODULE_DISABLED",
    });
    warnings.push("AP deshabilitado: pagos esperados en cero.");
  }

  const range =
    filters.dateFrom && filters.dateTo
      ? { dateFrom: filters.dateFrom, dateTo: filters.dateTo }
      : projectionHorizon(90);

  warnings.push(
    "Proyección basada en saldos pendientes de AR/AP con vencimiento hasta el fin del horizonte (incluye vencidas); no incluye OC abiertas (R-006).",
  );

  const [receivables, payables] = await Promise.all([
    includeAr
      ? prisma.receivable.findMany({
          where: {
            tenantId: ctx.tenantId,
            projectId,
            status: { in: [...OPEN_OBLIGATION] },
            ...(filters.currency ? { currency: filters.currency } : {}),
          },
          select: {
            currency: true,
            dueDate: true,
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
            ...(filters.currency ? { currency: filters.currency } : {}),
          },
          select: {
            currency: true,
            dueDate: true,
            originalAmount: true,
            paidAmount: true,
          },
        })
      : Promise.resolve([]),
  ]);

  const currencies = new Set<string>([
    ...receivables.map((r) => r.currency),
    ...payables.map((p) => p.currency),
  ]);

  const currencyRows: CashProjectionCurrency[] = [];

  for (const cur of currencies) {
    const bucketMap = new Map<string, { in: Prisma.Decimal; out: Prisma.Decimal }>();

    function ensure(key: string) {
      if (!bucketMap.has(key)) bucketMap.set(key, { in: new Prisma.Decimal(0), out: new Prisma.Decimal(0) });
      return bucketMap.get(key)!;
    }

    let recvCount = 0;
    for (const r of receivables.filter((x) => x.currency === cur)) {
      const balance = r.originalAmount.minus(r.paidAmount);
      if (balance.lessThanOrEqualTo(0)) continue;
      const key = projectionBucketKey(r.dueDate, range.dateFrom, range.dateTo);
      if (!key) continue;
      recvCount += 1;
      ensure(key).in = ensure(key).in.plus(balance);
    }

    let payCount = 0;
    for (const p of payables.filter((x) => x.currency === cur)) {
      const balance = p.originalAmount.minus(p.paidAmount);
      if (balance.lessThanOrEqualTo(0)) continue;
      const key = projectionBucketKey(p.dueDate, range.dateFrom, range.dateTo);
      if (!key) continue;
      payCount += 1;
      ensure(key).out = ensure(key).out.plus(balance);
    }

    let totalIn = new Prisma.Decimal(0);
    let totalOut = new Prisma.Decimal(0);
    const buckets: CashProjectionBucket[] = Array.from(bucketMap.keys())
      .sort()
      .map((key) => {
        const { in: inf, out } = bucketMap.get(key)!;
        totalIn = totalIn.plus(inf);
        totalOut = totalOut.plus(out);
        const net = inf.minus(out);
        return {
          periodKey: key,
          periodLabel: monthLabel(key),
          expectedInflows: inf.toFixed(2),
          expectedOutflows: out.toFixed(2),
          netExpected: net.toFixed(2),
        };
      });

    currencyRows.push({
      currency: cur,
      totalExpectedInflows: totalIn.toFixed(2),
      totalExpectedOutflows: totalOut.toFixed(2),
      netExpected: totalIn.minus(totalOut).toFixed(2),
      buckets,
      receivableOpenCount: recvCount,
      payableOpenCount: payCount,
    });
  }

  currencyRows.sort((a, b) =>
    a.currency === "ARS" ? -1 : b.currency === "ARS" ? 1 : a.currency.localeCompare(b.currency),
  );

  return {
    type: "REPORT",
    projectId,
    dateFrom: range.dateFrom,
    dateTo: range.dateTo,
    currencies: currencyRows,
    warnings,
    sectionsExcluded,
  };
}
