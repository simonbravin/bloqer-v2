-- Document folder tree ([D-113]): system + user folders per project.
-- Partial unique indexes: NULL parentId / systemKey need SQL (Postgres NULL ≠ NULL).

CREATE TYPE "DocumentFolderKind" AS ENUM ('SYSTEM', 'USER');

CREATE TYPE "DocumentFolderSystemKey" AS ENUM (
  'JOBSITE_LOG',
  'PURCHASE_REQUEST',
  'PURCHASE_ORDER',
  'PROCUREMENT_QUOTE',
  'PURCHASE_RECEIPT',
  'SALES_INVOICE',
  'SUPPLIER_INVOICE',
  'CERTIFICATION',
  'SUBCONTRACT',
  'BUDGET',
  'PLANS',
  'GENERAL'
);

CREATE TABLE "document_folders" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "parentId" TEXT,
  "name" TEXT NOT NULL,
  "kind" "DocumentFolderKind" NOT NULL,
  "systemKey" "DocumentFolderSystemKey",
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "document_folders_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "document_folders_tenantId_projectId_idx"
  ON "document_folders"("tenantId", "projectId");

CREATE INDEX "document_folders_tenantId_projectId_parentId_idx"
  ON "document_folders"("tenantId", "projectId", "parentId");

CREATE UNIQUE INDEX "document_folders_tenant_project_system_key"
  ON "document_folders"("tenantId", "projectId", "systemKey")
  WHERE "systemKey" IS NOT NULL;

CREATE UNIQUE INDEX "document_folders_tenant_project_root_name"
  ON "document_folders"("tenantId", "projectId", "name")
  WHERE "parentId" IS NULL;

CREATE UNIQUE INDEX "document_folders_tenant_project_parent_name"
  ON "document_folders"("tenantId", "projectId", "parentId", "name")
  WHERE "parentId" IS NOT NULL;

ALTER TABLE "document_folders"
  ADD CONSTRAINT "document_folders_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "document_folders"
  ADD CONSTRAINT "document_folders_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "projects"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "document_folders"
  ADD CONSTRAINT "document_folders_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "document_folders"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "document_attachments" ADD COLUMN "folderId" TEXT;

CREATE INDEX "document_attachments_tenantId_folderId_idx"
  ON "document_attachments"("tenantId", "folderId");

ALTER TABLE "document_attachments"
  ADD CONSTRAINT "document_attachments_folderId_fkey"
  FOREIGN KEY ("folderId") REFERENCES "document_folders"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
