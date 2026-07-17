-- D-049: optional counterparty + external invoice ref on AccountMovement (corporate treasury inflows).

ALTER TABLE "account_movements" ADD COLUMN "counterpartyContactId" TEXT;
ALTER TABLE "account_movements" ADD COLUMN "externalInvoiceRef" TEXT;

CREATE INDEX "account_movements_tenantId_counterpartyContactId_idx" ON "account_movements"("tenantId", "counterpartyContactId");

ALTER TABLE "account_movements" ADD CONSTRAINT "account_movements_counterpartyContactId_fkey" FOREIGN KEY ("counterpartyContactId") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
