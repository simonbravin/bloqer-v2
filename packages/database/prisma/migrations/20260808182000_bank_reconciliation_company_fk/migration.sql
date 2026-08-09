-- Optional FK: BankReconciliation.companyId → companies (shared/null accounts allowed).
-- Orphan companyIds are nullified before adding the constraint.

UPDATE "bank_reconciliations" br
SET "companyId" = NULL
WHERE "companyId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "companies" c WHERE c.id = br."companyId"
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'bank_reconciliations_companyId_fkey'
  ) THEN
    ALTER TABLE "bank_reconciliations"
      ADD CONSTRAINT "bank_reconciliations_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "companies"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "bank_reconciliations_companyId_idx"
ON "bank_reconciliations" ("companyId");
