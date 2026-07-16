-- BR-BUD-001: at most one APPROVED budget per project.
-- Uses existing `budgets` table only (no new tables/models).
-- Prisma cannot express partial unique indexes as @@unique without blocking other statuses.

-- Never choose or close a financial baseline implicitly. Existing duplicates require
-- an explicit, audited product decision before this migration can be deployed.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "budgets"
    WHERE status = 'APPROVED'
    GROUP BY "projectId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'BR-BUD-001: duplicate APPROVED budgets exist; close the superseded versions through the audited application flow before deploying this migration';
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS "budgets_one_approved_per_project_key"
ON "budgets" ("projectId")
WHERE status = 'APPROVED';
