-- Client-intent idempotency for purchase receipt create (BUG-053)
-- and jobsite log create (BUG-054). Partial unique indexes keep legacy NULL keys valid.

ALTER TABLE "purchase_receipts" ADD COLUMN "idempotencyKey" VARCHAR(36);
ALTER TABLE "jobsite_logs" ADD COLUMN "idempotencyKey" VARCHAR(36);

CREATE UNIQUE INDEX "purchase_receipts_tenant_idempotency_key"
ON "purchase_receipts" ("tenantId", "idempotencyKey")
WHERE "idempotencyKey" IS NOT NULL;

CREATE UNIQUE INDEX "jobsite_logs_tenant_idempotency_key"
ON "jobsite_logs" ("tenantId", "idempotencyKey")
WHERE "idempotencyKey" IS NOT NULL;
