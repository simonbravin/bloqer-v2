import { prisma } from "@bloqer/database";
import { isStorageConfigured } from "@bloqer/config";
import { ServiceError, type ServiceContext } from "../types";
import { getDocumentById } from "./document.service";
import { requireDocumentLinkAccess } from "./document-link-scope";

/** Adjacent revisions only: bounded reads and fresh authorization on each navigation. */
export async function getDocumentVersionLinks(id: string, ctx: ServiceContext) {
  const document = await getDocumentById(id, ctx);
  const row = await prisma.documentAttachment.findFirstOrThrow({ where: { id, tenantId: ctx.tenantId } });
  const companyId = await requireDocumentLinkAccess(row, ctx);
  const successor = await prisma.documentAttachment.findFirst({ where: {
    tenantId: ctx.tenantId, replacesAttachmentId: id, status: { in: ["ACTIVE", "ARCHIVED"] },
  }, select: { id: true } });
  async function link(targetId: string | undefined | null) {
    if (!targetId) return null;
    const target = await getDocumentById(targetId, ctx);
    const targetRow = await prisma.documentAttachment.findFirstOrThrow({ where: { id: targetId, tenantId: ctx.tenantId } });
    if (await requireDocumentLinkAccess(targetRow, ctx) !== companyId) throw new ServiceError("NOT_FOUND", "Revisión no encontrada");
    if (target.projectId !== document.projectId ||
      (target.linkedEntityType ?? "PROJECT") !== (document.linkedEntityType ?? "PROJECT") ||
      (target.linkedEntityId ?? target.projectId) !== (document.linkedEntityId ?? document.projectId)) {
      throw new ServiceError("NOT_FOUND", "Revisión no encontrada");
    }
    return { id: target.id, originalFileName: target.originalFileName };
  }
  return {
    document, previous: await link(row.replacesAttachmentId), next: await link(successor?.id),
    canCreateVersion: document.canMutate && document.status === "ACTIVE" && !successor,
    storageConfigured: isStorageConfigured(),
  };
}
