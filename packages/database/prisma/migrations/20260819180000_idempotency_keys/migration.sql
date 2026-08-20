-- Client-intent idempotency for manual stock consumption (BUG-001),
-- document upload (BUG-002), and payment / collection / internal transfer (BUG-004).
-- Partial unique indexes keep legacy rows with NULL keys valid.
-- Constraint names include "idempotency" so P2002 can be classified in services.

ALTER TABLE "stock_movements" ADD COLUMN "idempotencyKey" VARCHAR(36);
ALTER TABLE "payments" ADD COLUMN "idempotencyKey" VARCHAR(36);
ALTER TABLE "collections" ADD COLUMN "idempotencyKey" VARCHAR(36);
ALTER TABLE "internal_transfers" ADD COLUMN "idempotencyKey" VARCHAR(36);
ALTER TABLE "document_attachments" ADD COLUMN "idempotencyKey" VARCHAR(36);
ALTER TABLE "document_attachments" ADD COLUMN "contentSha256" VARCHAR(64);

CREATE UNIQUE INDEX "stock_movements_tenant_idempotency_key"
ON "stock_movements" ("tenantId", "idempotencyKey")
WHERE "idempotencyKey" IS NOT NULL;

CREATE UNIQUE INDEX "payments_tenant_idempotency_key"
ON "payments" ("tenantId", "idempotencyKey")
WHERE "idempotencyKey" IS NOT NULL;

CREATE UNIQUE INDEX "collections_tenant_idempotency_key"
ON "collections" ("tenantId", "idempotencyKey")
WHERE "idempotencyKey" IS NOT NULL;

CREATE UNIQUE INDEX "internal_transfers_tenant_idempotency_key"
ON "internal_transfers" ("tenantId", "idempotencyKey")
WHERE "idempotencyKey" IS NOT NULL;

CREATE UNIQUE INDEX "document_attachments_tenant_idempotency_key"
ON "document_attachments" ("tenantId", "idempotencyKey")
WHERE "idempotencyKey" IS NOT NULL;
