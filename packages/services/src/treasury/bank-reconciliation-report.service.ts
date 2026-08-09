import { Prisma, prisma } from "@bloqer/database";
import { can } from "@bloqer/domain";
import { buildCsv } from "../report-exports/csv-export.service";
import { canViewCompanyTreasury } from "../finance/finance-access";
import { serializeMoneyDecimal } from "../finance/money-decimal";
import { assertTenantModuleEnabled } from "../tenant-modules/tenant-module.service";
import { assertTreasuryTenantModule } from "../tenant-modules/tenant-module-enforcement";
import { ServiceContext, ServiceError } from "../types";

export type BankReconciliationStatusRow = {
  reconciliationId: string;
  accountId: string;
  accountName: string;
  periodStart: string;
  periodEnd: string;
  currency: string;
  status: string;
  openingBalance: string;
  closingBalance: string;
  statementLineCount: number;
  matchedLineCount: number;
  unmatchedLineCount: number;
  /** CONFIRMED movements in the session period still not RECONCILED. */
  unreconciledMovementCount: number;
  statementBalancesMatch: boolean;
};

export type BankReconciliationStatusReport = {
  dataAsOf: string;
  rows: BankReconciliationStatusRow[];
};

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function assertCanRun(ctx: ServiceContext): Promise<void> {
  await assertTreasuryTenantModule(ctx);
  await assertTenantModuleEnabled(ctx, "BANK_RECONCILIATION");
  if (!canViewCompanyTreasury(ctx.roles) || !can(ctx.roles, "VIEW", "BANK_RECONCILIATION")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver el reporte de conciliación");
  }
}

/**
 * R-020 — estado de conciliación bancaria por cuenta / período (sesión).
 */
export async function getBankReconciliationStatusReport(
  ctx: ServiceContext,
  filters?: { accountId?: string; limit?: number },
): Promise<BankReconciliationStatusReport> {
  await assertCanRun(ctx);
  const limit = Math.min(Math.max(filters?.limit ?? 50, 1), 200);

  const sessions = await prisma.bankReconciliation.findMany({
    where: {
      tenantId: ctx.tenantId,
      ...(filters?.accountId ? { accountId: filters.accountId } : {}),
      status: { not: "CANCELLED" },
    },
    orderBy: [{ periodEnd: "desc" }, { createdAt: "desc" }],
    take: limit,
    include: {
      account: { select: { id: true, name: true } },
      _count: { select: { lines: true, matches: true } },
      lines: {
        select: { direction: true, amount: true },
      },
    },
  });

  const rows: BankReconciliationStatusRow[] = [];

  for (const s of sessions) {
    const credits = s.lines
      .filter((l) => l.direction === "CREDIT")
      .reduce((acc, l) => acc.plus(l.amount), new Prisma.Decimal(0));
    const debits = s.lines
      .filter((l) => l.direction === "DEBIT")
      .reduce((acc, l) => acc.plus(l.amount), new Prisma.Decimal(0));
    const impliedClosing = s.openingBalance.plus(credits).minus(debits);

    const unreconciledMovementCount = await prisma.accountMovement.count({
      where: {
        tenantId: ctx.tenantId,
        accountId: s.accountId,
        status: "CONFIRMED",
        movementDate: { gte: s.periodStart, lte: s.periodEnd },
      },
    });

    const matchedLineCount = s._count.matches;
    const statementLineCount = s._count.lines;

    rows.push({
      reconciliationId: s.id,
      accountId: s.accountId,
      accountName: s.account.name,
      periodStart: toIso(s.periodStart),
      periodEnd: toIso(s.periodEnd),
      currency: s.currency,
      status: s.status,
      openingBalance: serializeMoneyDecimal(s.openingBalance),
      closingBalance: serializeMoneyDecimal(s.closingBalance),
      statementLineCount,
      matchedLineCount,
      unmatchedLineCount: Math.max(0, statementLineCount - matchedLineCount),
      unreconciledMovementCount,
      statementBalancesMatch: impliedClosing.equals(s.closingBalance),
    });
  }

  return {
    dataAsOf: new Date().toISOString(),
    rows,
  };
}

export async function exportBankReconciliationStatusCsv(
  ctx: ServiceContext,
  filters?: { accountId?: string; limit?: number },
): Promise<{ content: string; filename: string }> {
  const report = await getBankReconciliationStatusReport(ctx, filters);
  const headers = [
    "Cuenta",
    "PeriodoDesde",
    "PeriodoHasta",
    "Moneda",
    "Estado",
    "SaldoApertura",
    "SaldoCierre",
    "LineasExtracto",
    "LineasEmparejadas",
    "LineasSinMatch",
    "MovimientosSinConciliar",
    "SaldosExtractoCuadran",
    "SesionId",
  ];
  const data = report.rows.map((r) => [
    r.accountName,
    r.periodStart,
    r.periodEnd,
    r.currency,
    r.status,
    r.openingBalance,
    r.closingBalance,
    String(r.statementLineCount),
    String(r.matchedLineCount),
    String(r.unmatchedLineCount),
    String(r.unreconciledMovementCount),
    r.statementBalancesMatch ? "SI" : "NO",
    r.reconciliationId,
  ]);
  return {
    content: buildCsv(headers, data),
    filename: `conciliacion-bancaria-${new Date().toISOString().slice(0, 10)}.csv`,
  };
}
