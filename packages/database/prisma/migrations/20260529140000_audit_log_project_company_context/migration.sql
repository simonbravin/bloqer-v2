-- Tenant audit log: optional project/company context for scoped traceability filters.

ALTER TABLE "audit_logs" ADD COLUMN "projectId" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN "companyId" TEXT;

CREATE INDEX "audit_logs_tenantId_projectId_createdAt_idx" ON "audit_logs"("tenantId", "projectId", "createdAt");
CREATE INDEX "audit_logs_tenantId_companyId_createdAt_idx" ON "audit_logs"("tenantId", "companyId", "createdAt");

ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
