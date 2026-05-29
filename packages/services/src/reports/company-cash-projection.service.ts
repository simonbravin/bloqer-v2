import { Prisma, prisma } from "@bloqer/database";
import { can } from "@bloqer/domain";
import { canViewCompanyAp } from "../ap/ap-access";
import type { CorporatePayableSnapshotRow } from "../ap/corporate-ap-snapshot";
import { aggregateCorporateProjectionOutflows } from "../ap/corporate-ap-snapshot";
import { ACTIVE_OBLIGATION_STATUSES } from "../finance/obligation-status";
import { assertApTenantModule, assertTreasuryTenantModule } from "../tenant-modules/tenant-module-enforcement";
import { getTenantModuleGate } from "../tenant-modules/tenant-module.service";
import { getTreasurySummaryByCompany } from "../treasury/balance.service";
import type { ServiceContext } from "../types";
import { isDueOnOrBeforeHorizon, projectionHorizon } from "./report-month";

export type CompanyCashProjectionRow = {
  currency: string;
  cashBalance: string;
  expectedOutflows90d: string;
  projectedBalance: string;
  isNegative: boolean;
  openPayableCount: number;
};

export type CompanyCashProjectionReport = {
  dateFrom: string;
  dateTo: string;
  rows: CompanyCashProjectionRow[];
  warnings: string[];
};

const zero = new Prisma.Decimal(0);

export type CompanyCashProjectionOptions = {
  /** Preloaded corporate payables — avoids duplicate query when composed with overview. */
  payableRows?: CorporatePayableSnapshotRow[];
};

/**
 * Corporate liquidity projection: treasury balance today minus expected AP outflows
 * (payables with projectId null) due within the horizon. No AR inflows at company scope.
 */
export async function getCompanyCashProjectionReport(
  ctx: ServiceContext,
  opts?: CompanyCashProjectionOptions,
): Promise<CompanyCashProjectionReport> {
  const gate = await getTenantModuleGate(ctx);
  const range = projectionHorizon(90);
  const warnings: string[] = [];

  const cashByCurrency = new Map<string, Prisma.Decimal>();
  const outflowsByCurrency = new Map<string, Prisma.Decimal>();
  const payCountByCurrency = new Map<string, number>();

  if (gate.isEnabled("TREASURY") && can(ctx.roles, "VIEW", "TREASURY")) {
    await assertTreasuryTenantModule(ctx);
    const accounts = await getTreasurySummaryByCompany(ctx);
    for (const acc of accounts) {
      const bal = new Prisma.Decimal(acc.balance);
      cashByCurrency.set(acc.currency, (cashByCurrency.get(acc.currency) ?? zero).add(bal));
    }
  } else {
    warnings.push("Tesorería no disponible: saldo de caja en cero para la proyección.");
  }

  if (gate.isEnabled("AP") && canViewCompanyAp(ctx.roles)) {
    await assertApTenantModule(ctx);
    const payables =
      opts?.payableRows ??
      (await prisma.payable.findMany({
        where: {
          tenantId: ctx.tenantId,
          projectId: null,
          status: { notIn: ["PAID", "CANCELLED"] },
          ...(ctx.companyId ? { companyId: ctx.companyId } : {}),
        },
        select: {
          currency: true,
          dueDate: true,
          originalAmount: true,
          paidAmount: true,
          status: true,
        },
      }));

    for (const slice of aggregateCorporateProjectionOutflows(payables, range.dateTo)) {
      outflowsByCurrency.set(slice.currency, slice.expectedOutflows);
      payCountByCurrency.set(slice.currency, slice.openPayableCount);
    }
  } else {
    warnings.push("AP no disponible: egresos esperados en cero.");
  }

  const currencies = new Set([...cashByCurrency.keys(), ...outflowsByCurrency.keys()]);
  const rows: CompanyCashProjectionRow[] = [...currencies]
    .sort((a, b) => (a === "ARS" ? -1 : b === "ARS" ? 1 : a.localeCompare(b)))
    .map((currency) => {
      const cash = cashByCurrency.get(currency) ?? zero;
      const out = outflowsByCurrency.get(currency) ?? zero;
      const projected = cash.minus(out);
      return {
        currency,
        cashBalance: cash.toFixed(2),
        expectedOutflows90d: out.toFixed(2),
        projectedBalance: projected.toFixed(2),
        isNegative: projected.lessThan(0),
        openPayableCount: payCountByCurrency.get(currency) ?? 0,
      };
    })
    .filter(
      (r) =>
        !new Prisma.Decimal(r.cashBalance).isZero() ||
        !new Prisma.Decimal(r.expectedOutflows90d).isZero(),
    );

  return { dateFrom: range.dateFrom, dateTo: range.dateTo, rows, warnings };
}

/** @internal exported for tests */
export function isCorporatePayableInProjectionHorizon(
  row: CorporatePayableSnapshotRow,
  horizonEnd: string,
): boolean {
  const bal = row.originalAmount.minus(row.paidAmount);
  if (bal.lessThanOrEqualTo(0)) return false;
  if (!ACTIVE_OBLIGATION_STATUSES.includes(row.status as (typeof ACTIVE_OBLIGATION_STATUSES)[number])) {
    return false;
  }
  return isDueOnOrBeforeHorizon(row.dueDate, horizonEnd);
}
