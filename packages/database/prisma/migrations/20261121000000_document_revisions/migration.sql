-- Additive D-146 revision chain. Existing attachments keep NULL and their original bytes.
ALTER TABLE "document_attachments" ADD COLUMN "replacesAttachmentId" TEXT;
CREATE UNIQUE INDEX "document_attachments_tenantId_id_key" ON "document_attachments" ("tenantId", "id");
CREATE INDEX "document_attachments_tenantId_replacesAttachmentId_idx" ON "document_attachments" ("tenantId", "replacesAttachmentId");
ALTER TABLE "document_attachments" ADD CONSTRAINT "document_attachments_revision_tenant_fkey"
  FOREIGN KEY ("tenantId", "replacesAttachmentId") REFERENCES "document_attachments" ("tenantId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "document_attachments" ADD CONSTRAINT "document_attachments_revision_not_self"
  CHECK ("replacesAttachmentId" IS NULL OR "replacesAttachmentId" <> "id");
CREATE UNIQUE INDEX "document_attachments_one_confirmed_revision"
  ON "document_attachments" ("tenantId", "replacesAttachmentId")
  WHERE "replacesAttachmentId" IS NOT NULL AND "status" IN ('ACTIVE', 'ARCHIVED');
