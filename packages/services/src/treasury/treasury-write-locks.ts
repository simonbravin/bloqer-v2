import type { prisma } from "@bloqer/database";
import { assertFinancialPeriodOpen } from "../finance/period-lock.service";

type TxClient = Omit<
  typeof prisma,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

/** Serialize balance checks vs concurrent OUTFLOWs on the same account. */
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
