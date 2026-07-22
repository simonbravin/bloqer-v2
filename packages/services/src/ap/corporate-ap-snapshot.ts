import { Prisma, prisma } from "@bloqer/database";
import { isDueOnOrBeforeHorizon } from "../reports/report-month";
import { hasOpenObligationBalance, isObligationOverdue, OBLIGATION_OPEN_BALANCE_EPSILON } from "../finance/obligation-date";
import { startOfTodayUtc } from "../finance/pagination";
import { ACTIVE_OBLIGATION_STATUSES } from "../finance/obligation-status";
import { assertApTenantModule } from "../tenant-modules/tenant-module-enforcement";
import type { ServiceContext } from "../types";
import { ServiceError } from "../types";
import { canViewCompanyAp } from "./ap-access";
import type { PayablesProjectSummary } from "./payable.service";
import { serializeMoneyDecimal } from "../finance/money-decimal";

export type CorporatePayableSnapshotRow = {
  currency: string;
  dueDate: Date;
  originalAmount: Prisma.Decimal;
  paidAmount: Prisma.Decimal;
  status: string;
};

export type CorporatePayableOperationsSlice = {
  openPayableCount: number;
  openPayableBalancesByCurrency: {
    currency: string;
    openLineCount: number;
    totalBalanceDue: string;
  }[];
};

export type CorporateProjectionOutflowSlice = {
  currency: string;
  expectedOutflows: Prisma.Decimal;
  openPayableCount: number;
};

const ZERO = new Prisma.Decimal(0);

export async function fetchCorporatePayableSnapshotRows(
  ctx: ServiceContext,
): Promise<CorporatePayableSnapshotRow[]> {
  await assertApTenantModule(ctx);
  if (!canViewCompanyAp(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver cuentas por pagar a nivel empresa");
  }

  return prisma.payable.findMany({
    where: {
      tenantId: ctx.tenantId,
      projectId: null,
      status: { notIn: ["PAID", "CANCELLED"] },
      // Payable.companyId es NOT NULL → scope directo por empresa (no hay filas compartidas).
      ...(ctx.companyId ? { companyId: ctx.companyId } : {}),
    },
    select: {
      currency: true,
      dueDate: true,
      originalAmount: true,
      paidAmount: true,
      status: true,
    },
  });
}

export async function countCorporateDraftInvoices(ctx: ServiceContext): Promise<number> {
  await assertApTenantModule(ctx);
  if (!canViewCompanyAp(ctx.roles)) return 0;
  return prisma.supplierInvoice.count({
    where: {
      tenantId: ctx.tenantId,
      projectId: null,
      status: "DRAFT",
      // SupplierInvoice.companyId es NOT NULL → scope directo por empresa.
      ...(ctx.companyId ? { companyId: ctx.companyId } : {}),
    },
  });
}

function openBalance(row: CorporatePayableSnapshotRow): Prisma.Decimal | null {
  if (row.status === "CANCELLED") return null;
  const bal = row.originalAmount.minus(row.paidAmount);
  if (!hasOpenObligationBalance(bal, OBLIGATION_OPEN_BALANCE_EPSILON)) return null;
  return bal;
}

export function aggregateCorporatePayableBalances(
  rows: CorporatePayableSnapshotRow[],
  asOf: Date = startOfTodayUtc(),
): PayablesProjectSummary {
  const total = new Map<string, Prisma.Decimal>();
  const overdue = new Map<string, Prisma.Decimal>();

  for (const row of rows) {
    const bal = openBalance(row);
    if (!bal) continue;
    const cur = row.currency;
    total.set(cur, (total.get(cur) ?? ZERO).add(bal));
    if (isObligationOverdue(row.dueDate, asOf)) {
      overdue.set(cur, (overdue.get(cur) ?? ZERO).add(bal));
    }
  }

  const toRows = (m: Map<string, Prisma.Decimal>) =>
    [...m.entries()]
      .filter(([, v]) => hasOpenObligationBalance(v, OBLIGATION_OPEN_BALANCE_EPSILON))
      .map(([currency, amount]) => ({ currency, amount: serializeMoneyDecimal(amount) }))
      .sort((a, b) => a.currency.localeCompare(b.currency));

  return { totalByCurrency: toRows(total), overdueByCurrency: toRows(overdue) };
}

export function aggregateCorporatePayableOperations(
  rows: CorporatePayableSnapshotRow[],
): CorporatePayableOperationsSlice {
  const byCur = new Map<string, { count: number; sum: Prisma.Decimal }>();
  let openPayableCount = 0;

  for (const row of rows) {
    const bal = openBalance(row);
    if (!bal) continue;
    if (!ACTIVE_OBLIGATION_STATUSES.includes(row.status as (typeof ACTIVE_OBLIGATION_STATUSES)[number])) {
      continue;
    }
    openPayableCount += 1;
    const cur = row.currency;
    const agg = byCur.get(cur) ?? { count: 0, sum: ZERO };
    agg.count += 1;
    agg.sum = agg.sum.add(bal);
    byCur.set(cur, agg);
  }

  return {
    openPayableCount,
    openPayableBalancesByCurrency: [...byCur.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([currency, agg]) => ({
        currency,
        openLineCount: agg.count,
        totalBalanceDue: serializeMoneyDecimal(agg.sum),
      })),
  };
}

export function aggregateCorporateProjectionOutflows(
  rows: CorporatePayableSnapshotRow[],
  horizonEnd: string,
): CorporateProjectionOutflowSlice[] {
  const outflows = new Map<string, Prisma.Decimal>();
  const counts = new Map<string, number>();

  for (const row of rows) {
    const bal = openBalance(row);
    if (!bal) continue;
    if (!ACTIVE_OBLIGATION_STATUSES.includes(row.status as (typeof ACTIVE_OBLIGATION_STATUSES)[number])) {
      continue;
    }
    if (!isDueOnOrBeforeHorizon(row.dueDate, horizonEnd)) continue;
    const cur = row.currency;
    outflows.set(cur, (outflows.get(cur) ?? ZERO).add(bal));
    counts.set(cur, (counts.get(cur) ?? 0) + 1);
  }

  return [...new Set([...outflows.keys(), ...counts.keys()])]
    .sort((a, b) => (a === "ARS" ? -1 : b === "ARS" ? 1 : a.localeCompare(b)))
    .map((currency) => ({
      currency,
      expectedOutflows: outflows.get(currency) ?? ZERO,
      openPayableCount: counts.get(currency) ?? 0,
    }));
}
