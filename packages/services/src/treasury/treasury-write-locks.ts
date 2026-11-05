import type { prisma } from "@bloqer/database";
import { assertFinancialPeriodOpen } from "../finance/period-lock.service";
import { ServiceError } from "../types";

type TxClient = Omit<
  typeof prisma,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

/**
 * Serialize balance checks vs concurrent OUTFLOWs on the same account.
 * Writers acquire project (when present), company, then account locks in that order.
 * Multiple accounts are locked by sorted id; never acquire a company after an account.
 */
export async function lockTreasuryAccountRow(
  tx: TxClient,
  accountId: string,
  tenantId: string,
): Promise<void> {
  await tx.$queryRaw`
    SELECT id FROM treasury_accounts
    WHERE id = ${accountId} AND "tenantId" = ${tenantId}
    FOR UPDATE
  `;
}

/** Cancellation may change a balance on an inactive account, but not on a closed account. */
export async function assertTreasuryAccountCanReverse(
  tx: TxClient,
  accountId: string,
  tenantId: string,
): Promise<void> {
  await lockTreasuryAccountRow(tx, accountId, tenantId);
  const account = await tx.treasuryAccount.findFirst({
    where: { id: accountId, tenantId },
    select: { status: true },
  });
  if (!account) throw new ServiceError("NOT_FOUND", "Cuenta de tesorería no encontrada");
  if (account.status === "CLOSED") {
    throw new ServiceError("CONFLICT", "No se puede modificar el saldo de una cuenta de tesorería cerrada");
  }
}

/** Serialize vs period close (same company row lock as closeFinancialPeriod). */
export async function lockCompanyForFinancialWrite(
  tx: TxClient,
  companyId: string,
): Promise<void> {
  await tx.$queryRaw`SELECT id FROM companies WHERE id = ${companyId} FOR UPDATE`;
}

/**
 * Company FOR UPDATE then period-open assert. Call inside the mutating transaction
 * before creating/cancelling CONFIRMED cash movements.
 */
export async function assertPeriodOpenUnderCompanyLock(
  tx: TxClient,
  params: {
    tenantId: string;
    companyId: string;
    date: Date | string;
  },
): Promise<void> {
  await lockCompanyForFinancialWrite(tx, params.companyId);
  await assertFinancialPeriodOpen(
    {
      tenantId: params.tenantId,
      companyId: params.companyId,
      date: params.date,
    },
    tx,
  );
}

/** Lock every participating company in one stable order before checking its dates. */
export async function assertTreasuryPeriodsOpenUnderCompanyLocks(
  tx: TxClient,
  tenantId: string,
  periods: ReadonlyArray<{ companyId: string | null; date: Date }>,
): Promise<void> {
  const companyIds = [...new Set(periods.flatMap(({ companyId }) => companyId ? [companyId] : []))].sort();
  for (const companyId of companyIds) {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM companies WHERE id = ${companyId} AND "tenantId" = ${tenantId} FOR UPDATE
    `;
    if (locked.length !== 1) {
      throw new ServiceError("FORBIDDEN", "Empresa no disponible para esta operación de tesorería");
    }
  }
  const checked = new Set<string>();
  for (const { companyId, date } of periods) {
    if (!companyId) continue; // D-078: legacy movements without a company have no period lock.
    const key = `${companyId}:${date.toISOString().slice(0, 10)}`;
    if (checked.has(key)) continue;
    await assertFinancialPeriodOpen({ tenantId, companyId, date }, tx);
    checked.add(key);
  }
}
