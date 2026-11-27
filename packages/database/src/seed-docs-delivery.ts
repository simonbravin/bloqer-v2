import type { PrismaClient } from "@prisma/client";

/** Maintained docs/CI fixture: metadata only, never synthetic claims of stored originals. */
export async function seedDocsDeliveryIndexFixture(prisma: PrismaClient, ctx: {
  tenantId: string; docsUserId: string; projectId: string; companyId: string;
}): Promise<void> {
  for (let i = 0; i < 28; i += 1) {
    const id = `a0000400-0000-4000-8000-${String(i + 1).padStart(12, "0")}`;
    const originalFileName = `Entrega CI ${String(i).padStart(2, "0")}.pdf`;
    const data = {
      tenantId: ctx.tenantId, companyId: ctx.companyId, projectId: ctx.projectId,
      originalFileName, fileName: originalFileName, mimeType: "application/pdf", sizeBytes: 0,
      storageProvider: "PLACEHOLDER" as const,
      storageKey: `${ctx.tenantId}/${ctx.projectId}/${id}/delivery.pdf`,
      linkedEntityType: "PROJECT" as const, linkedEntityId: ctx.projectId,
      uploadedBy: ctx.docsUserId, category: "PLAN" as const,
      description: "Fixture mantenida del índice de entrega. No contiene un original almacenado.",
      status: i === 0 ? "ARCHIVED" as const : "ACTIVE" as const,
      replacesAttachmentId: i === 1 ? "a0000400-0000-4000-8000-000000000001" : null,
      createdAt: new Date(Date.UTC(2026, 10, 27, 12, i)),
    };
    await prisma.documentAttachment.upsert({ where: { id }, create: { id, ...data }, update: data });
  }
}
