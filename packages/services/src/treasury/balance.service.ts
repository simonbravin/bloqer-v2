import { Prisma, prisma } from "@bloqer/database";
import type { ServiceContext } from "../types";
import { assertTreasuryTenantModule } from "../tenant-modules/tenant-module-enforcement";
import { serializeMoneyDecimal } from "../finance/money-decimal";

type TxClient = Omit<typeof prisma, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

// Signs: INFLOW/TRANSFER_IN = +1, OUTFLOW/TRANSFER_OUT/ADJUSTMENT = -1
function movementSign(type: string): 1 | -1 {
  return type === "INFLOW" || type === "TRANSFER_IN" ? 1 : -1;
}

/** P-TRZ-06: avoid double-count when OPENING_BALANCE movement mirrors TreasuryAccount.openingBalance. */
export function resolveOpeningBase(
  accountOpeningBalance: Prisma.Decimal,
  hasOpeningBalanceMovement: boolean,
): Prisma.Decimal {
  return hasOpeningBalanceMovement ? new Prisma.Decimal(0) : accountOpeningBalance;
}

export async function getAccountBalanceAsOf(
  accountId: string,
  options?: { beforeDate?: Date },
  tx: TxClient = prisma,
): Promise<Prisma.Decimal> {
  const account = await tx.treasuryAccount.findUnique({
    where: { id: accountId },
    select: { openingBalance: true },
  });
  if (!account) return new Prisma.Decimal(0);

  const openingMovement = await tx.accountMovement.findFirst({
    where: { accountId, status: "CONFIRMED", sourceType: "OPENING_BALANCE" },
    select: { id: true },
  });
  const base = resolveOpeningBase(account.openingBalance, openingMovement != null);

  const movements = await tx.accountMovement.findMany({
    where: {
      accountId,
      status: "CONFIRMED",
      ...(options?.beforeDate ? { movementDate: { lt: options.beforeDate } } : {}),
    },
    select: { type: true, amount: true },
  });

  return movements.reduce((sum, m) => {
    const signed = movementSign(m.type as string) === 1
      ? m.amount
      : m.amount.negated();
    return sum.plus(signed);
  }, base);
}

export async function getAccountBalance(
  accountId: string,
  tx: TxClient = prisma,
): Promise<Prisma.Decimal> {
  return getAccountBalanceAsOf(accountId, undefined, tx);
}

export type AccountBalanceSummary = {
  accountId: string;
  name: string;
  type: string;
  currency: string;
  status: string;
  balance: string;
};

async function loadAccountSummaries(
  where: Prisma.TreasuryAccountWhereInput,
): Promise<AccountBalanceSummary[]> {
  const accounts = await prisma.treasuryAccount.findMany({
    where,
    select: { id: true, name: true, type: true, currency: true, status: true },
    orderBy: { name: "asc" },
  });

  const results: AccountBalanceSummary[] = [];
  for (const acc of accounts) {
    const balance = await getAccountBalance(acc.id);
    results.push({
      accountId: acc.id,
      name: acc.name,
      type: acc.type as string,
      currency: acc.currency,
      status: acc.status as string,
      balance: serializeMoneyDecimal(balance),
    });
  }
  return results;
}

/**
 * Saldos de cuentas activas con alcance **tenant** (todas las empresas del tenant).
 *
 * Tesorería es corporativa/compartida en la plataforma: las cuentas y sus movimientos
 * no se auto-filtran por `ctx.companyId` en ningún lugar del módulo `/tesoreria`
 * (`listTreasuryAccounts`, reportes de posición/flujo/movimientos, transferencias son
 * todos tenant-scoped; sólo un `filters.companyId` explícito acota). Por eso este resumen
 * —usado por el hub de tesorería, el tablero, el hub de finanzas y la proyección de caja—
 * es tenant-scoped: así la "Posición de caja" de Finanzas coincide con el reporte de Tesorería
 * y no se pierden las cuentas con `companyId` null cuando el usuario tiene empresa activa.
 */
export async function getTreasurySummaryByTenant(
  ctx: ServiceContext,
): Promise<AccountBalanceSummary[]> {
  await assertTreasuryTenantModule(ctx);
  return loadAccountSummaries({
    tenantId: ctx.tenantId,
    status: "ACTIVE",
  });
}
