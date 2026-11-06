import { Prisma, prisma } from "@bloqer/database";
import { ServiceError, type ServiceContext } from "../types";
import { assertTreasuryTenantModule } from "../tenant-modules/tenant-module-enforcement";
import { canViewCompanyTreasury } from "../finance/finance-access";
import { serializeMoneyDecimal } from "../finance/money-decimal";
import { BALANCE_AFFECTING_MOVEMENT_STATUSES } from "./balance-affecting-statuses";

type TxClient = Omit<typeof prisma, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;
type BalanceCutoff = { beforeDate?: Date; dateBasis?: "accounting" | "value" };
type BalanceAccount = { id: string; openingBalance: Prisma.Decimal };
type BalanceDb = { accountMovement: Pick<TxClient["accountMovement"], "groupBy"> };

/** P-TRZ-06: avoid double-count when OPENING_BALANCE movement mirrors TreasuryAccount.openingBalance. */
export function resolveOpeningBase(
  accountOpeningBalance: Prisma.Decimal,
  hasOpeningBalanceMovement: boolean,
): Prisma.Decimal {
  return hasOpeningBalanceMovement ? new Prisma.Decimal(0) : accountOpeningBalance;
}

/** Aggregate the ledger for already authorized accounts, without fetching the movement history. */
export async function getAccountBalancesForAccounts(
  accounts: readonly BalanceAccount[],
  tenantId: string,
  options?: BalanceCutoff,
  db: BalanceDb = prisma,
): Promise<Map<string, Prisma.Decimal>> {
  if (accounts.length === 0) return new Map();
  const scope = { tenantId, accountId: { in: accounts.map(({ id }) => id) } };
  const cutoff = options?.beforeDate ? { lt: options.beforeDate } : undefined;
  const [openings, movements] = await Promise.all([
    // An opening posted after the cutoff still replaces the legacy opening field.
    db.accountMovement.groupBy({
      by: ["accountId"],
      where: { ...scope, sourceType: "OPENING_BALANCE" },
    }),
    db.accountMovement.groupBy({
      by: ["accountId", "type"],
      where: {
        ...scope,
        status: { in: [...BALANCE_AFFECTING_MOVEMENT_STATUSES] },
        ...(cutoff ? (options?.dateBasis === "value"
          ? { OR: [{ valueDate: cutoff }, { valueDate: null, movementDate: cutoff }] }
          : { movementDate: cutoff }) : {}),
      },
      _sum: { amount: true },
    }),
  ]);

  const openingIds = new Set(openings.map(({ accountId }) => accountId));
  const balances = new Map(accounts.map(({ id, openingBalance }) => [
    id, resolveOpeningBase(openingBalance, openingIds.has(id)),
  ]));
  for (const { accountId, type, _sum: { amount } } of movements) {
    const balance = balances.get(accountId);
    if (balance === undefined || amount === null) continue;
    const inflow = type === "INFLOW" || type === "TRANSFER_IN";
    balances.set(accountId, inflow ? balance.plus(amount) : balance.minus(amount));
  }
  return balances;
}

export async function getAccountBalanceAsOf(
  accountId: string,
  options?: BalanceCutoff,
  tx: TxClient = prisma,
): Promise<Prisma.Decimal> {
  const account = await tx.treasuryAccount.findUnique({
    where: { id: accountId },
    select: { id: true, openingBalance: true, tenantId: true },
  });
  if (!account) return new Prisma.Decimal(0);
  const balances = await getAccountBalancesForAccounts([account], account.tenantId, options, tx);
  return balances.get(accountId)!;
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
  if (!canViewCompanyTreasury(ctx.roles)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver saldos de tesorería");
  }
  const accounts = await prisma.treasuryAccount.findMany({
    where: {
      tenantId: ctx.tenantId,
      OR: [{ companyId: null }, { company: { tenantId: ctx.tenantId } }],
      status: "ACTIVE",
    },
    select: { id: true, name: true, type: true, currency: true, status: true, openingBalance: true },
    orderBy: { name: "asc" },
  });
  const balances = await getAccountBalancesForAccounts(accounts, ctx.tenantId);
  return accounts.map((acc) => ({
    accountId: acc.id,
    name: acc.name,
    type: acc.type,
    currency: acc.currency,
    status: acc.status,
    balance: serializeMoneyDecimal(balances.get(acc.id)!),
  }));
}
