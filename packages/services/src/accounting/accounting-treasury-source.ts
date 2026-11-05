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
    where: { id, tenantId, status: "CONFIRMED" },
    include: {
      sourceAccount: { select: treasuryAccountSelect },
      destinationAccount: { select: treasuryAccountSelect },
    },
  });
  if (!transfer || transfer.sourceAccountId === transfer.destinationAccountId) return null;
  if (!transfer.amount.greaterThan(0)) return null;
  if ([transfer.sourceAccount, transfer.destinationAccount].some(account =>
    account.tenantId !== tenantId || account.currency !== transfer.currency)) return null;

  // Current and legacy legs both carry the root as sourceId; old rows used a separate pair id.
  const legs = await db.accountMovement.findMany({
    where: { tenantId, sourceType: "INTERNAL_TRANSFER", sourceId: id },
  });
  const out = legs.find(leg => leg.type === "TRANSFER_OUT");
  const incoming = legs.find(leg => leg.type === "TRANSFER_IN");
  if (legs.length !== 2 || !out || !incoming) return null;
  if (out.accountId !== transfer.sourceAccountId || incoming.accountId !== transfer.destinationAccountId) return null;
  if (out.companyId !== (transfer.sourceAccount.companyId ?? transfer.companyId) ||
      incoming.companyId !== (transfer.destinationAccount.companyId ?? transfer.companyId)) return null;
  if (legs.some(leg => leg.status !== "CONFIRMED" && leg.status !== "RECONCILED")) return null;
  if (legs.some(leg => leg.currency !== transfer.currency || !leg.amount.equals(transfer.amount) ||
      leg.movementDate.getTime() !== transfer.transferDate.getTime())) return null;
  return { transfer, out, incoming };
}
