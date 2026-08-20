import { prisma } from "@bloqer/database";
import type { LinkedEntityType } from "@bloqer/database";
import { uploadDocument } from "../../../../packages/services/src/documents/document.service";

export const FIELD_EVIDENCE_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAlElEQVR4nO3QMQ0AIAwEsQ78s+UHmhQY0nDJzT5n5g7A/rcA4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8B4H8BAPABFl0CAf0nVYkAAAAASUVORK5CYII=",
  "base64",
);

export type FieldEvidenceEntityType = Extract<
  LinkedEntityType,
  "JOBSITE_LOG" | "PURCHASE_REQUEST" | "PURCHASE_RECEIPT"
>;

export async function replaySameEvidenceAndAssertSingleDocument(input: {
  entityType: FieldEvidenceEntityType;
  entityId: string;
  projectId: string;
}): Promise<{ documentId: string; contentSha256: string | null }> {
  const docs = await prisma.documentAttachment.findMany({
    where: {
      linkedEntityType: input.entityType,
      linkedEntityId: input.entityId,
      status: { not: "DELETED" },
    },
    orderBy: { createdAt: "asc" },
  });
  if (docs.length !== 1) {
    throw new Error(`Se esperaba 1 Document, hay ${docs.length} para ${input.entityType} ${input.entityId}`);
  }
  const doc = docs[0]!;
  if (!doc.idempotencyKey) {
    throw new Error("El Document no tiene idempotencyKey; el retry no puede reutilizar la operación");
  }

  const replay = await uploadDocument(
    {
      projectId: input.projectId,
      originalFileName: doc.originalFileName,
      mimeType: "image/png",
      sizeBytes: FIELD_EVIDENCE_PNG.length,
      category: doc.category,
      linkedEntityType: input.entityType,
      linkedEntityId: input.entityId,
      idempotencyKey: doc.idempotencyKey,
    },
    FIELD_EVIDENCE_PNG,
    {
      actorUserId: doc.uploadedBy,
      tenantId: doc.tenantId,
      companyId: doc.companyId,
      roles: ["OWNER"],
    },
  );

  if (replay.documentId !== doc.id) {
    throw new Error(`El replay devolvió ${replay.documentId} en vez de ${doc.id}`);
  }

  const after = await prisma.documentAttachment.count({
    where: {
      linkedEntityType: input.entityType,
      linkedEntityId: input.entityId,
      status: { not: "DELETED" },
    },
  });
  if (after !== 1) {
    throw new Error(`Después del replay hay ${after} Documents; se esperaba 1`);
  }

  return { documentId: doc.id, contentSha256: doc.contentSha256 };
}
