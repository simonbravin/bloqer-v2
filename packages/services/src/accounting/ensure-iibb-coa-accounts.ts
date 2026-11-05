import { prisma, type AccountType } from "@bloqer/database";
import {
  COA_IIBB_PERCEPTION_CREDIT,
  COA_IIBB_PERCEPTION_DEBIT,
} from "./accounting-invoice-journal-lines";
import { lockAccountingCompany } from "./accounting-company-context";

const IIBB_COA_SEED: Array<{ code: string; name: string; type: AccountType }> = [
  {
    code: COA_IIBB_PERCEPTION_CREDIT,
    name: "Percepción IIBB Crédito Fiscal",
    type: "ASSET",
  },
  {
    code: COA_IIBB_PERCEPTION_DEBIT,
    name: "Percepción IIBB a depositar",
    type: "LIABILITY",
  },
];

/**
 * Idempotent backfill of D-112 IIBB CoA codes for companies that already applied
 * an older Argentine template (ar_construction_v2). Safe to call on every issue.
 */
export async function ensureIibbPerceptionCoaAccounts(
  tenantId: string,
  companyId: string,
): Promise<void> {
  const where = { tenantId, companyId, code: { in: IIBB_COA_SEED.map(account => account.code) } };
  const active = await prisma.accountingAccount.count({ where: { ...where, isActive: true } });
  if (active === IIBB_COA_SEED.length) return;
  await prisma.$transaction(async (tx) => {
    await lockAccountingCompany(tx, tenantId, companyId);
    const existing = await tx.accountingAccount.findMany({
      where,
      select: { code: true, isActive: true },
    });
    for (const acc of IIBB_COA_SEED) {
      if (existing.some(account => account.code === acc.code && account.isActive)) continue;
      await tx.accountingAccount.upsert({
        where: { tenantId_companyId_code: { tenantId, companyId, code: acc.code } },
        create: {
          tenantId,
          companyId,
          code: acc.code,
          name: acc.name,
          type: acc.type,
          isActive: true,
        },
        update: { isActive: true },
      });
    }
  }, { maxWait: 10_000, timeout: 30_000 });
}
