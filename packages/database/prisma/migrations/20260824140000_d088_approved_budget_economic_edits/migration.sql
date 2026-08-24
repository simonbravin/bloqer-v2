-- D-088: exceptional economic edits on APPROVED budgets (tenant kill-switch + per-project flag).
-- Defaults OFF. Snapshots freeze totals at approval time.

ALTER TABLE "tenants"
  ADD COLUMN "allowApprovedBudgetEconomicEdits" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "projects"
  ADD COLUMN "allowApprovedBudgetEconomicEdits" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "budgets"
  ADD COLUMN "approvedSnapshotTotalCost" DECIMAL(18,4),
  ADD COLUMN "approvedSnapshotTotalSalePrice" DECIMAL(18,4);
