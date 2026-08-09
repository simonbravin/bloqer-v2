import { prisma, type JournalEntrySourceType } from "@bloqer/database";
import { isCrossCompany } from "../company-scope";
import { ServiceContext, ServiceError } from "../types";
import { cancelJournalEntryAsAutomation } from "./journal-entry.service";

type CancelSyncParams = {
  companyId: string;
  sourceType: JournalEntrySourceType;
  sourceId: string;
  sourceLabel: string;
  /** Default true. Set false for tenant-wide treasury (e.g. InternalTransfer). */
  enforceCompanyScope?: boolean;
};

async function findLinkedJournal(ctx: ServiceContext, params: CancelSyncParams) {
  return prisma.journalEntry.findFirst({
    where: {
      tenantId: ctx.tenantId,
      companyId: params.companyId,
      sourceType: params.sourceType,
      sourceId: params.sourceId,
      status: { not: "CANCELLED" },
    },
    select: { id: true, status: true, reversedByEntry: { select: { id: true } } },
  });
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
 * Does not cancel DRAFT journals — call {@link cancelDraftJournalOnOperationalCancel} after
 * the operational txn succeeds so a failed ops cancel cannot orphan a cancelled draft.
 */
export async function assertJournalAllowsOperationalCancel(
  ctx: ServiceContext,
  params: CancelSyncParams,
): Promise<void> {
  assertCompanyScope(ctx, params);
  const entry = await findLinkedJournal(ctx, params);
  if (!entry) return;
  if (entry.status === "POSTED" && !entry.reversedByEntry) {
    throw new ServiceError(
      "CONFLICT",
      `No se puede anular ${params.sourceLabel}: tiene un asiento contabilizado. Revertí el asiento en Contabilidad primero.`,
    );
  }
}

/**
 * Cancel a linked DRAFT journal after operational cancel committed.
 * No-op if none / already CANCELLED. Throws CONFLICT if a non-reversed POSTED journal
 * appeared after the pre-check (race) — never silently leave books linked to cancelled cash.
 */
export async function cancelDraftJournalOnOperationalCancel(
  ctx: ServiceContext,
  params: CancelSyncParams,
): Promise<void> {
  assertCompanyScope(ctx, params);
  const entry = await findLinkedJournal(ctx, params);
  if (!entry) return;
  if (entry.status === "POSTED" && !entry.reversedByEntry) {
    throw new ServiceError(
      "CONFLICT",
      `No se pudo completar la anulación de ${params.sourceLabel}: el asiento se contabilizó mientras se anulaba. Revertí el asiento en Contabilidad y contactá soporte si el documento operativo quedó anulado.`,
    );
  }
  if (entry.status !== "DRAFT") return;
  await cancelJournalEntryAsAutomation(entry.id, ctx, { skipPeriodLock: true });
}

/**
 * @deprecated Prefer the split path:
 * `assertJournalAllowsOperationalCancel` → ops txn → `cancelDraftJournalOnOperationalCancel`.
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
