-- [D-075]/[D-080]: at most one DRAFT|IN_PROGRESS bank reconciliation per account.
-- Prisma cannot express partial unique indexes as @@unique.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT "tenantId", "accountId"
      FROM "bank_reconciliations"
      WHERE status IN ('DRAFT', 'IN_PROGRESS')
      GROUP BY "tenantId", "accountId"
      HAVING COUNT(*) > 1
    ) dups
  ) THEN
    RAISE EXCEPTION
      'Cannot create bank_reconciliations_one_open_per_account_key: duplicate open sessions for the same account exist. Close or cancel extras first.';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "bank_reconciliations_one_open_per_account_key"
ON "bank_reconciliations" ("tenantId", "accountId")
WHERE status IN ('DRAFT', 'IN_PROGRESS');
