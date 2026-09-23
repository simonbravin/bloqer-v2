-- D-116 / BR-BUD-001: one APPROVED principal per project.
-- Addenda (parentBudgetId set) may also be APPROVED and sum with the principal.

DROP INDEX IF EXISTS "budgets_one_approved_per_project_key";

CREATE UNIQUE INDEX IF NOT EXISTS "budgets_one_approved_root_per_project_key"
ON "budgets" ("projectId")
WHERE status = 'APPROVED' AND "parentBudgetId" IS NULL;
