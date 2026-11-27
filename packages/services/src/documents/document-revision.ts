import type { DocumentAttachment, Prisma } from "@bloqer/database";
import { log } from "../audit/audit.service";
import { ServiceError, type ServiceContext } from "../types";

type RevisionScope = Pick<DocumentAttachment, "id" | "projectId" | "companyId" | "linkedEntityType" | "linkedEntityId">;

/** Project lock (when applicable) precedes this lock in all upload paths. */
export async function lockRevisionPredecessor(
  tx: Prisma.TransactionClient, replacesAttachmentId: string | null | undefined,
  revision: RevisionScope, ctx: ServiceContext,
) {
  if (!replacesAttachmentId) return null;
  await tx.$queryRaw`SELECT "id" FROM "document_attachments" WHERE "id" = ${replacesAttachmentId} AND "tenantId" = ${ctx.tenantId} FOR UPDATE`;
  const previous = await tx.documentAttachment.findFirst({ where: { id: replacesAttachmentId, tenantId: ctx.tenantId } });
  if (!previous || previous.id === revision.id || previous.projectId !== revision.projectId ||
    (previous.companyId !== null && previous.companyId !== revision.companyId) ||
    (previous.linkedEntityType ?? "PROJECT") !== revision.linkedEntityType ||
    (previous.linkedEntityId ?? previous.projectId) !== revision.linkedEntityId) {
    throw new ServiceError("FORBIDDEN", "La revisión no pertenece al mismo documento, empresa, obra y entidad");
  }
  const successor = await tx.documentAttachment.findFirst({ where: {
    tenantId: ctx.tenantId, replacesAttachmentId, status: { in: ["ACTIVE", "ARCHIVED"] },
  }, select: { id: true } });
  if (previous.status !== "ACTIVE" || successor) {
    throw new ServiceError("CONFLICT", "El archivo ya fue archivado o tiene una revisión posterior. Abrí la última revisión para continuar; el original se conserva.");
  }
  return previous;
}

export async function archiveRevisionPredecessor(
  tx: Prisma.TransactionClient, previous: DocumentAttachment | null,
  revisionId: string, ctx: ServiceContext,
) {
  if (!previous) return;
  const result = await tx.documentAttachment.updateMany({
    where: { id: previous.id, tenantId: ctx.tenantId, status: "ACTIVE" }, data: { status: "ARCHIVED" },
  });
  if (result.count !== 1) throw new ServiceError("CONFLICT", "La revisión anterior cambió. Recargá e intentá de nuevo.");
  await log({
    tenantId: ctx.tenantId, actorUserId: ctx.actorUserId, companyId: previous.companyId,
    projectId: previous.projectId, entityType: "DocumentAttachment", entityId: previous.id,
    action: "document.archived", before: { status: "ACTIVE" }, after: { status: "ARCHIVED", replacedByAttachmentId: revisionId },
  }, tx);
}
