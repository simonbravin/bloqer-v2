-- D-149: additive capability/evidence storage. Existing quotes remain untouched.
CREATE TABLE "procurement_quote_invitations" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "purchaseRequestId" TEXT NOT NULL,
  "supplierContactId" TEXT NOT NULL,
  "tokenHash" VARCHAR(64) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "revokedBy" TEXT,
  "requestSnapshot" JSONB NOT NULL,
  "requestFingerprint" VARCHAR(64) NOT NULL,
  "responsePayload" JSONB,
  "responseHash" VARCHAR(64),
  "respondedAt" TIMESTAMP(3),
  "importedQuoteId" TEXT,
  "importedAt" TIMESTAMP(3),
  "importedBy" TEXT,
  "createdBy" TEXT NOT NULL,
  "updatedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "procurement_quote_invitations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "quote_invitation_tenant_fk" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "quote_invitation_company_fk" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "quote_invitation_project_fk" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "quote_invitation_request_fk" FOREIGN KEY ("purchaseRequestId") REFERENCES "purchase_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "quote_invitation_supplier_fk" FOREIGN KEY ("supplierContactId") REFERENCES "contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "quote_invitation_import_fk" FOREIGN KEY ("importedQuoteId") REFERENCES "procurement_quotes"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "quote_invitation_response_complete" CHECK (("respondedAt" IS NULL AND "responsePayload" IS NULL AND "responseHash" IS NULL) OR ("respondedAt" IS NOT NULL AND "responsePayload" IS NOT NULL AND "responseHash" IS NOT NULL)),
  CONSTRAINT "quote_invitation_import_requires_response" CHECK ("importedAt" IS NULL OR ("respondedAt" IS NOT NULL AND "importedBy" IS NOT NULL))
);
CREATE UNIQUE INDEX "procurement_quote_invitations_tokenHash_key" ON "procurement_quote_invitations"("tokenHash");
CREATE UNIQUE INDEX "procurement_quote_invitations_importedQuoteId_key" ON "procurement_quote_invitations"("importedQuoteId");
CREATE INDEX "procurement_quote_invitations_tenantId_purchaseRequestId_idx" ON "procurement_quote_invitations"("tenantId", "purchaseRequestId");
CREATE INDEX "procurement_quote_invitations_tenantId_companyId_projectId_idx" ON "procurement_quote_invitations"("tenantId", "companyId", "projectId");
CREATE UNIQUE INDEX "quote_invitation_one_pending" ON "procurement_quote_invitations"("tenantId", "purchaseRequestId", "supplierContactId") WHERE "revokedAt" IS NULL AND "respondedAt" IS NULL;
