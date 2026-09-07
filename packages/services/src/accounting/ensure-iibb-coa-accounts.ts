import { prisma, type AccountType } from "@bloqer/database";
import {
  COA_IIBB_PERCEPTION_CREDIT,
  COA_IIBB_PERCEPTION_DEBIT,
} from "./accounting-invoice-journal-lines";

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
  for (const acc of IIBB_COA_SEED) {
    const existing = await prisma.accountingAccount.findFirst({
      where: { tenantId, companyId, code: acc.code },
      select: { id: true, isActive: true },
    });
    if (!existing) {
      await prisma.accountingAccount.create({
        data: {
          tenantId,
          companyId,
          code: acc.code,
          name: acc.name,
          type: acc.type,
          isActive: true,
        },
      });
      continue;
    }
    if (!existing.isActive) {
      await prisma.accountingAccount.update({
        where: { id: existing.id },
        data: { isActive: true },
      });
    }
  }
}
