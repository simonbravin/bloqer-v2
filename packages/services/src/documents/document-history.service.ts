import { prisma } from "@bloqer/database";
import type { LinkedEntityType, Prisma } from "@bloqer/database";
import { ServiceError, type ServiceContext } from "../types";
import { companyScopeFilter } from "../company-scope";
import { resolveUserDisplayNames } from "../user/resolve-user-display-names";
import { getDocumentById } from "./document.service";
import { requireDocumentLinkAccess } from "./document-link-scope";

const DOCUMENT_HISTORY_ACTIONS = [
  "document.created", "document.upload_initiated", "document.uploaded",
  "document.upload_confirmed", "document.archived", "document.reactivated",
  "document.deleted", "document.moved_folder",
] as const;

export type DocumentHistoryEntry = {
  id: string;
  action: string;
  actorName: string;
  createdAt: string;
};

export type DocumentHistoryPage = {
  entries: DocumentHistoryEntry[];
  nextCursor: string | null;
};

/** Existing audit only: never expose raw payloads, IP addresses or storage keys. */
export async function getDocumentHistory(
  documentId: string,
  ctx: ServiceContext,
  cursor?: string,
): Promise<DocumentHistoryPage> {
  // Reauthorize on every page, including access to the operational parent.
  const doc = await getDocumentById(documentId, ctx);
  const companyId = await requireDocumentLinkAccess({ ...doc, linkedEntityType: doc.linkedEntityType as LinkedEntityType | null }, ctx);
  const scope: Prisma.AuditLogWhereInput = {
    tenantId: ctx.tenantId,
    entityType: "DocumentAttachment",
    entityId: documentId,
    action: { in: [...DOCUMENT_HISTORY_ACTIONS] },
    AND: [
      companyScopeFilter(ctx),
      { OR: [{ projectId: doc.projectId }, { projectId: null }] },
      { OR: [{ companyId }, { companyId: null }] },
    ],
  };
  let older: Prisma.AuditLogWhereInput = {};
  if (cursor) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cursor)) {
      throw new ServiceError("VALIDATION", "Página de historial inválida");
    }
    const anchor = await prisma.auditLog.findFirst({
      where: { AND: [scope, { id: cursor }] }, select: { id: true, createdAt: true },
    });
    if (!anchor) throw new ServiceError("VALIDATION", "La página no pertenece al historial del documento");
    older = { OR: [
      { createdAt: { lt: anchor.createdAt } },
      { createdAt: anchor.createdAt, id: { lt: anchor.id } },
    ] };
  }
  const rows = await prisma.auditLog.findMany({
    where: { AND: [scope, older] },
    select: { id: true, action: true, actorUserId: true, createdAt: true },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 51,
  });
  const page = rows.slice(0, 50);
  const names = await resolveUserDisplayNames(page.map((row) => row.actorUserId), ctx);
  return {
    entries: page.map((row) => ({
      id: row.id, action: row.action, createdAt: row.createdAt.toISOString(),
      actorName: row.actorUserId ? names.get(row.actorUserId) ?? "Usuario desconocido" : "Sistema",
    })),
    nextCursor: rows.length > 50 ? page[page.length - 1]!.id : null,
  };
}
