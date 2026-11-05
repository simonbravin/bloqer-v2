import { prisma, type JournalEntrySourceType, type Prisma } from "@bloqer/database";
import { isCrossCompany } from "../company-scope";
import { ServiceContext, ServiceError } from "../types";
import { cancelJournalEntryAsAutomation, isValidJournalReversal, journalReversalSelect } from "./journal-entry.service";

type CancelSyncParams = {
  companyId: string;
  sourceType: JournalEntrySourceType;
  sourceId: string;
  sourceLabel: string;
  /** Default true. Set false for tenant-wide treasury (e.g. InternalTransfer). */
  enforceCompanyScope?: boolean;
};

async function findLinkedJournals(ctx: ServiceContext, params: CancelSyncParams, db: Prisma.TransactionClient | typeof prisma = prisma) {
  const where = { tenantId: ctx.tenantId, sourceType: params.sourceType, sourceId: params.sourceId, status: { not: "CANCELLED" as const } };
  const select = { id: true, tenantId: true, companyId: true, status: true, reversedByEntry: { select: journalReversalSelect } } as const;
  // Legacy intercompany transfers could get a draft in the destination company.
  // Still guard their origin on cancellation without moving or duplicating the historical journal.
  if (params.sourceType === "INTERNAL_TRANSFER" && params.enforceCompanyScope === false) {
    return db.journalEntry.findMany({ where, select, orderBy: [{ companyId: "asc" }, { id: "asc" }] });
  }
  const entry = await db.journalEntry.findFirst({ where: { ...where, companyId: params.companyId }, select });
  return entry ? [entry] : [];
}

function blocksOperationalCancel(entry: Awaited<ReturnType<typeof findLinkedJournals>>[number]): boolean {
  return entry.status === "POSTED" && !isValidJournalReversal(entry, entry.reversedByEntry);
}

/** Operational callers lock Project first; Company serializes cancel, create and posting. */
async function lockCancelCompany(tx: Prisma.TransactionClient, ctx: ServiceContext, params: CancelSyncParams): Promise<void> {
  await tx.$queryRaw`SELECT id FROM companies WHERE id = ${params.companyId} AND "tenantId" = ${ctx.tenantId} FOR UPDATE`;
}

function assertCompanyScope(ctx: ServiceContext, params: CancelSyncParams): void {
  if (params.enforceCompanyScope !== false && isCrossCompany(params.companyId, ctx)) {
    throw new ServiceError(
      "FORBIDDEN",
      `No se puede anular ${params.sourceLabel}: pertenece a otra empresa`,
    );
  }
}

/**
 * Pre-check before mutating operational cash: block if a non-reversed POSTED journal exists.
 * Does not cancel DRAFT journals. Call {@link cancelDraftJournalOnOperationalCancel} inside
 * the operational transaction so a rejected cancellation leaves both sides intact.
 */
export async function assertJournalAllowsOperationalCancel(
  ctx: ServiceContext,
  params: CancelSyncParams,
  tx?: Prisma.TransactionClient,
): Promise<void> {
  assertCompanyScope(ctx, params);
  if (tx) await lockCancelCompany(tx, ctx, params);
  const entries = await findLinkedJournals(ctx, params, tx);
  if (entries.some(blocksOperationalCancel)) {
    throw new ServiceError(
      "CONFLICT",
      `No se puede anular ${params.sourceLabel}: tiene un asiento contabilizado. Revertí el asiento en Contabilidad primero.`,
    );
  }
}

/**
 * With tx, guard + DRAFT cancellation + audit participate in the operational transaction.
 * Without tx, supports cleanup of historically cancelled origins.
 * A closed period on the DRAFT blocks cancellation under D-135.
 * No-op if none / already CANCELLED. Throws CONFLICT if a non-reversed POSTED journal
 * appeared after the pre-check (race) — never silently leave books linked to cancelled cash.
 */
export async function cancelDraftJournalOnOperationalCancel(
  ctx: ServiceContext,
  params: CancelSyncParams,
  tx?: Prisma.TransactionClient,
): Promise<void> {
  assertCompanyScope(ctx, params);
  const sync = async (db: Prisma.TransactionClient) => {
    await lockCancelCompany(db, ctx, params);
    const entries = await findLinkedJournals(ctx, params, db);
    if (entries.some(blocksOperationalCancel)) {
      throw new ServiceError(
        "CONFLICT",
        `No se pudo completar la anulación de ${params.sourceLabel}: el asiento se contabilizó mientras se anulaba. Revertí el asiento en Contabilidad y contactá soporte si el documento operativo quedó anulado.`,
      );
    }
    for (const entry of entries) {
      if (entry.status === "DRAFT") await cancelJournalEntryAsAutomation(entry.id, ctx, db);
    }
  };
  if (tx) return sync(tx);
  // Calls for already-cancelled legacy origins have no caller transaction. Recheck
  // and repair in one transaction if any linked journal still needs attention.
  const preview = await findLinkedJournals(ctx, params);
  if (!preview.some(entry => entry.status === "DRAFT" || blocksOperationalCancel(entry))) return;
  await prisma.$transaction(sync, { maxWait: 10_000, timeout: 30_000 });
}

/**
 * @deprecated Call the guard and the DRAFT cleanup with the operational transaction.
 * This thin wrapper remains for docs/tests; production callers should not use it
 * (cancelling the DRAFT before a failed ops txn can leave GL inconsistent).
 *
 * Company-scoped sources (AR/AP invoices, collections, payments) enforce
 * `isCrossCompany` so a membership anchored to company A cannot cancel (and
 * thus soft-cancel GL of) company B. Tenant-wide treasury sources may pass
 * `enforceCompanyScope: false` (see TENANT_COMPANY_SCOPING §2.1).
 */
export async function syncJournalOnOperationalCancel(
  ctx: ServiceContext,
  params: CancelSyncParams,
): Promise<void> {
  await assertJournalAllowsOperationalCancel(ctx, params);
  await cancelDraftJournalOnOperationalCancel(ctx, params);
}
