-- Client-intent idempotency for warehouse transfers (stock OUT+IN pair) and
-- confirmed treasury inflows / manual adjustments (AccountMovement).
-- Partial unique indexes keep legacy NULL keys valid.
-- Constraint names include "idempotency" so P2002 can be classified in services.

ALTER TABLE "warehouse_transfers" ADD COLUMN "idempotencyKey" VARCHAR(36);
ALTER TABLE "account_movements" ADD COLUMN "idempotencyKey" VARCHAR(36);

CREATE UNIQUE INDEX "warehouse_transfers_tenant_idempotency_key"
ON "warehouse_transfers" ("tenantId", "idempotencyKey")
WHERE "idempotencyKey" IS NOT NULL;

CREATE UNIQUE INDEX "account_movements_tenant_idempotency_key"
ON "account_movements" ("tenantId", "idempotencyKey")
WHERE "idempotencyKey" IS NOT NULL;
