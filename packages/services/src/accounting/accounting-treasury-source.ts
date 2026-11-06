import type { Prisma } from "@bloqer/database";
import { treasuryMovementSupportsAccountingDraft } from "./accounting-treasury-gl-eligibility";

const usableMovementStatuses = ["CONFIRMED", "RECONCILED"] as const;
const treasuryAccountSelect = { id: true, tenantId: true, companyId: true, type: true, currency: true } as const;

export async function loadTreasuryJournalMovement(
  db: Prisma.TransactionClient,
  tenantId: string,
  id: string,
) {
  const movement = await db.accountMovement.findFirst({
    where: { id, tenantId, status: { in: [...usableMovementStatuses] } },
    include: { account: { select: treasuryAccountSelect } },
  });
  if (!movement || !treasuryMovementSupportsAccountingDraft(movement)) return null;
  if (movement.account.tenantId !== tenantId || movement.account.currency !== movement.currency) return null;
  if (!movement.amount.greaterThan(0)) return null;
  if (movement.companyId && movement.account.companyId && movement.companyId !== movement.account.companyId) return null;
  return movement;
}

export async function loadTreasuryJournalTransfer(
  db: Prisma.TransactionClient,
  tenantId: string,
  id: string,
) {
  const transfer = await db.internalTransfer.findFirst({
    where: { id, tenantId, status: "CONFIRMED", company: { tenantId } },
    include: {
      sourceAccount: { select: treasuryAccountSelect },
      destinationAccount: { select: treasuryAccountSelect },
    },
  });
  if (!transfer || transfer.sourceAccountId === transfer.destinationAccountId) return null;
  if (!transfer.amount.greaterThan(0)) return null;
  if ([transfer.sourceAccount, transfer.destinationAccount].some(account =>
    account.tenantId !== tenantId || account.currency !== transfer.currency)) return null;

  // Same historical linkage as the treasury transfer detail and cancellation.
  const legs = await db.accountMovement.findMany({
    where: {
      tenantId, sourceType: "INTERNAL_TRANSFER", account: { tenantId },
      OR: [{ sourceId: id }, { transferId: id }],
    },
  });
  const out = legs.find(leg => leg.type === "TRANSFER_OUT");
  const incoming = legs.find(leg => leg.type === "TRANSFER_IN");
  if (legs.length !== 2 || !out || !incoming) return null;
  if (!out.transferId || out.transferId !== incoming.transferId) return null;
  if (out.accountId !== transfer.sourceAccountId || incoming.accountId !== transfer.destinationAccountId) return null;
  for (const [leg, account] of [[out, transfer.sourceAccount], [incoming, transfer.destinationAccount]] as const) {
    if (leg.sourceId !== id && (leg.sourceId !== null || leg.transferId !== id)) return null;
    if (leg.companyId !== null && leg.companyId !== (account.companyId ?? transfer.companyId)) return null;
    if (leg.status !== "CONFIRMED" && leg.status !== "RECONCILED") return null;
    if (leg.currency !== transfer.currency || !leg.amount.equals(transfer.amount) ||
        leg.movementDate.getTime() !== transfer.transferDate.getTime() ||
        leg.valueDate?.getTime() !== transfer.valueDate?.getTime()) return null;
  }
  return { transfer, out, incoming };
}
