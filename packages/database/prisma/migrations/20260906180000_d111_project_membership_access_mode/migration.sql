-- D-111: ProjectMembership ACL + projectAccessMode (default TENANT_WIDE = backward compatible)
-- Neon DEV only until explicitly approved for production.

CREATE TYPE "ProjectAccessMode" AS ENUM ('TENANT_WIDE', 'MEMBERSHIP_SCOPED');

ALTER TABLE "tenants"
  ADD COLUMN "projectAccessMode" "ProjectAccessMode" NOT NULL DEFAULT 'TENANT_WIDE';

CREATE TABLE "project_memberships" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_memberships_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "project_memberships_tenantId_projectId_userId_key"
  ON "project_memberships"("tenantId", "projectId", "userId");

CREATE INDEX "project_memberships_tenantId_userId_idx"
  ON "project_memberships"("tenantId", "userId");

CREATE INDEX "project_memberships_tenantId_projectId_idx"
  ON "project_memberships"("tenantId", "projectId");

ALTER TABLE "project_memberships"
  ADD CONSTRAINT "project_memberships_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "project_memberships"
  ADD CONSTRAINT "project_memberships_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "projects"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "project_memberships"
  ADD CONSTRAINT "project_memberships_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
