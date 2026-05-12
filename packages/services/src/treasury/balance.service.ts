import { Prisma, prisma } from "@bloqer/database";
import type { ServiceContext } from "../types";
import { assertTreasuryTenantModule } from "../tenant-modules/tenant-module-enforcement";

type TxClient = Omit<typeof prisma, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

// Signs: INFLOW/TRANSFER_IN = +1, OUTFLOW/TRANSFER_OUT/ADJUSTMENT = -1
function movementSign(type: string): 1 | -1 {
  return type === "INFLOW" || type === "TRANSFER_IN" ? 1 : -1;
}

export async function getAccountBalance(
  accountId: string,
  tx: TxClient = prisma,
): Promise<Prisma.Decimal> {
  const account = await tx.treasuryAccount.findUnique({
    where: { id: accountId },
    select: { openingBalance: true },
  });
  const base = account?.openingBalance ?? new Prisma.Decimal(0);

  const movements = await tx.accountMovement.findMany({
    where: { accountId, status: "CONFIRMED" },
    select: { type: true, amount: true },
  });

  return movements.reduce((sum, m) => {
    const signed = movementSign(m.type as string) === 1
      ? m.amount
      : m.amount.negated();
    return sum.plus(signed);
  }, base);
}

export type AccountBalanceSummary = {
  accountId: string;
  name: string;
  type: string;
  currency: string;
  status: string;
  balance: string;
};

export async function getTreasurySummaryByCompany(
  ctx: ServiceContext,
): Promise<AccountBalanceSummary[]> {
  await assertTreasuryTenantModule(ctx);
  const tenantId = ctx.tenantId;
  const companyId = ctx.companyId ?? null;
  const accounts = await prisma.treasuryAccount.findMany({
    where: {
      tenantId,
      ...(companyId ? { companyId } : {}),
      status: "ACTIVE",
    },
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
      balance: balance.toString(),
    });
  }
  return results;
}
