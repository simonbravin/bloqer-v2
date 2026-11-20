import { prisma } from "@bloqer/database";
import type { LinkedEntityType, Prisma } from "@bloqer/database";
import { ServiceError, type ServiceContext } from "../types";
import { companyScopeFilter } from "../company-scope";
import { resolveUserDisplayNames } from "../user/resolve-user-display-names";
import { getDocumentById } from "./document.service";
import { requireDocumentLinkAccess } from "./document-link-scope";
import { buildCsv } from "../report-exports/csv-export.service";

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
async function documentHistoryScope(
  documentId: string,
  ctx: ServiceContext,
) {
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
  return { doc, companyId, scope };
}

export async function getDocumentHistory(
  documentId: string,
  ctx: ServiceContext,
  cursor?: string,
): Promise<DocumentHistoryPage> {
  const { scope } = await documentHistoryScope(documentId, ctx);
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

/** One bounded query: export the complete authorized history, never silently truncate. */
export async function exportDocumentHistory(documentId: string, ctx: ServiceContext): Promise<string> {
  const { doc, companyId, scope } = await documentHistoryScope(documentId, ctx);
  const rows = await prisma.auditLog.findMany({
    where: scope,
    select: { id: true, action: true, actorUserId: true, createdAt: true },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 5001,
  });
  if (rows.length > 5000) throw new ServiceError("CONFLICT", "El historial supera los 5.000 movimientos permitidos por exportación. Podés seguir consultándolo por páginas; no se descargó un archivo incompleto.");
  const names = await resolveUserDisplayNames(rows.map((row) => row.actorUserId), ctx);
  return buildCsv(
    ["Documento ID", "Archivo", "Empresa ID", "Proyecto ID", "Entidad", "Entidad ID", "Evento ID", "Movimiento", "Responsable", "Fecha y hora UTC"],
    rows.map((row) => [
      doc.id, doc.originalFileName, companyId ?? "", doc.projectId ?? "", doc.linkedEntityType ?? "", doc.linkedEntityId ?? "",
      row.id, row.action, row.actorUserId ? names.get(row.actorUserId) ?? "Usuario desconocido" : "Sistema", row.createdAt.toISOString(),
    ]),
  );
}
