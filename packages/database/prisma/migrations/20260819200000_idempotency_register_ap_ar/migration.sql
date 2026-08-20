-- Client-intent idempotency for registerApExpense / registerArSale composites
-- (ISSUED invoice + Payable/Receivable). DRAFT invoice creates stay without a key.
-- Partial unique indexes keep legacy NULL keys valid.
-- Constraint names include "idempotency" so P2002 can be classified in services.

ALTER TABLE "supplier_invoices" ADD COLUMN "idempotencyKey" VARCHAR(36);
ALTER TABLE "sales_invoices" ADD COLUMN "idempotencyKey" VARCHAR(36);

CREATE UNIQUE INDEX "supplier_invoices_tenant_idempotency_key"
ON "supplier_invoices" ("tenantId", "idempotencyKey")
WHERE "idempotencyKey" IS NOT NULL;

CREATE UNIQUE INDEX "sales_invoices_tenant_idempotency_key"
ON "sales_invoices" ("tenantId", "idempotencyKey")
WHERE "idempotencyKey" IS NOT NULL;
