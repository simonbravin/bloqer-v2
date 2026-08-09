-- D-082: BR-SUB-005 succession + Phase 4 multitenant indexes

-- AlterTable
ALTER TABLE "subcontract_certifications" ADD COLUMN "replacesCertificationId" TEXT;

-- AddForeignKey
ALTER TABLE "subcontract_certifications" ADD CONSTRAINT "subcontract_certifications_replacesCertificationId_fkey" FOREIGN KEY ("replacesCertificationId") REFERENCES "subcontract_certifications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "subcontract_certifications_replacesCertificationId_idx" ON "subcontract_certifications"("replacesCertificationId");

-- CreateIndex
CREATE INDEX "receivables_tenantId_projectId_dueDate_idx" ON "receivables"("tenantId", "projectId", "dueDate");

-- CreateIndex
CREATE INDEX "payables_tenantId_supplierContactId_dueDate_idx" ON "payables"("tenantId", "supplierContactId", "dueDate");

-- CreateIndex
CREATE INDEX "certifications_tenantId_projectId_periodStart_idx" ON "certifications"("tenantId", "projectId", "periodStart");

-- CreateIndex
CREATE INDEX "stock_movements_tenantId_projectId_wbsNodeId_idx" ON "stock_movements"("tenantId", "projectId", "wbsNodeId");

-- CreateIndex
CREATE INDEX "stock_movements_tenantId_wbsNodeId_idx" ON "stock_movements"("tenantId", "wbsNodeId");
