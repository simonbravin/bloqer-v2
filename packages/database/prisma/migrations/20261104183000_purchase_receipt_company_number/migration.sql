-- D-127: new receipts receive a company-scoped sequence in the service transaction.
-- Preserve historical UUID-only documents: no invented retroactive numbering.
ALTER TABLE "purchase_receipts" ADD COLUMN "number" INTEGER;

CREATE UNIQUE INDEX "purchase_receipts_tenantId_companyId_number_key"
    ON "purchase_receipts"("tenantId", "companyId", "number");
