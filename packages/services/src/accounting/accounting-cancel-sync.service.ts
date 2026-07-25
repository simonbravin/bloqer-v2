import { prisma, type JournalEntrySourceType } from "@bloqer/database";
import { isCrossCompany } from "../company-scope";
import { ServiceContext, ServiceError } from "../types";
import { cancelJournalEntryAsAutomation } from "./journal-entry.service";

/**
 * Before cancelling an operational source that may have a GL journal:
 * - DRAFT → auto-cancel journal
 * - POSTED (without reverse) → block operational cancel [D-061]
 *
 * Company-scoped sources (AR/AP invoices, collections, payments) enforce
 * `isCrossCompany` so a membership anchored to company A cannot cancel (and
 * thus soft-cancel GL of) company B. Tenant-wide treasury sources may pass
 * `enforceCompanyScope: false` (see TENANT_COMPANY_SCOPING §2.1).
 */
export async function syncJournalOnOperationalCancel(
  ctx: ServiceContext,
  params: {
    companyId: string;
    sourceType: JournalEntrySourceType;
    sourceId: string;
    sourceLabel: string;
    /** Default true. Set false for tenant-wide treasury (e.g. InternalTransfer). */
    enforceCompanyScope?: boolean;
  },
): Promise<void> {
  if (params.enforceCompanyScope !== false && isCrossCompany(params.companyId, ctx)) {
    throw new ServiceError(
      "FORBIDDEN",
      `No se puede anular ${params.sourceLabel}: pertenece a otra empresa`,
    );
  }

  const entry = await prisma.journalEntry.findFirst({
    where: {
      tenantId: ctx.tenantId,
      companyId: params.companyId,
      sourceType: params.sourceType,
      sourceId: params.sourceId,
      status: { not: "CANCELLED" },
    },
    select: { id: true, status: true, reversedByEntry: { select: { id: true } } },
  });
  if (!entry) return;

  if (entry.status === "DRAFT") {
    await cancelJournalEntryAsAutomation(entry.id, ctx);
    return;
  }

  if (entry.status === "POSTED") {
    if (entry.reversedByEntry) return;
    throw new ServiceError(
      "CONFLICT",
      `No se puede anular ${params.sourceLabel}: tiene un asiento contabilizado. Revertí el asiento en Contabilidad primero.`,
    );
  }
}
