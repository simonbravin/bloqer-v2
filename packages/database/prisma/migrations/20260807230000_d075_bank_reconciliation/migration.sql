-- D-075 / Q-007 option 1: manual bank reconciliation (Phase 1)

ALTER TYPE "AccountMovementStatus" ADD VALUE IF NOT EXISTS 'RECONCILED';

CREATE TYPE "BankReconciliationStatus" AS ENUM ('DRAFT', 'IN_PROGRESS', 'CLOSED', 'CANCELLED');
CREATE TYPE "BankStatementLineDirection" AS ENUM ('CREDIT', 'DEBIT');

CREATE TABLE "bank_reconciliations" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "companyId" TEXT,
  "accountId" TEXT NOT NULL,
  "periodStart" DATE NOT NULL,
  "periodEnd" DATE NOT NULL,
  "currency" TEXT NOT NULL,
  "openingBalance" DECIMAL(18,4) NOT NULL,
  "closingBalance" DECIMAL(18,4) NOT NULL,
  "status" "BankReconciliationStatus" NOT NULL DEFAULT 'DRAFT',
  "notes" TEXT,
  "createdBy" TEXT,
  "updatedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "bank_reconciliations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "bank_statement_lines" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "reconciliationId" TEXT NOT NULL,
  "lineDate" DATE NOT NULL,
  "description" TEXT NOT NULL,
  "amount" DECIMAL(18,4) NOT NULL,
  "direction" "BankStatementLineDirection" NOT NULL,
  "reference" VARCHAR(120),
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "bank_statement_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "bank_reconciliation_matches" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "reconciliationId" TEXT NOT NULL,
  "statementLineId" TEXT NOT NULL,
  "accountMovementId" TEXT NOT NULL,
  "matchedBy" TEXT,
  "matchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bank_reconciliation_matches_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "bank_reconciliations_tenantId_accountId_status_idx"
  ON "bank_reconciliations"("tenantId", "accountId", "status");
CREATE INDEX "bank_reconciliations_tenantId_periodStart_periodEnd_idx"
  ON "bank_reconciliations"("tenantId", "periodStart", "periodEnd");
CREATE INDEX "bank_statement_lines_tenantId_reconciliationId_idx"
  ON "bank_statement_lines"("tenantId", "reconciliationId");
CREATE INDEX "bank_reconciliation_matches_tenantId_reconciliationId_idx"
  ON "bank_reconciliation_matches"("tenantId", "reconciliationId");
CREATE INDEX "account_movements_tenantId_status_idx"
  ON "account_movements"("tenantId", "status");

CREATE UNIQUE INDEX "bank_reconciliation_matches_statementLineId_key"
  ON "bank_reconciliation_matches"("statementLineId");
CREATE UNIQUE INDEX "bank_reconciliation_matches_accountMovementId_key"
  ON "bank_reconciliation_matches"("accountMovementId");

ALTER TABLE "bank_reconciliations"
  ADD CONSTRAINT "bank_reconciliations_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bank_reconciliations"
  ADD CONSTRAINT "bank_reconciliations_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "treasury_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "bank_statement_lines"
  ADD CONSTRAINT "bank_statement_lines_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bank_statement_lines"
  ADD CONSTRAINT "bank_statement_lines_reconciliationId_fkey"
  FOREIGN KEY ("reconciliationId") REFERENCES "bank_reconciliations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "bank_reconciliation_matches"
  ADD CONSTRAINT "bank_reconciliation_matches_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bank_reconciliation_matches"
  ADD CONSTRAINT "bank_reconciliation_matches_reconciliationId_fkey"
  FOREIGN KEY ("reconciliationId") REFERENCES "bank_reconciliations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bank_reconciliation_matches"
  ADD CONSTRAINT "bank_reconciliation_matches_statementLineId_fkey"
  FOREIGN KEY ("statementLineId") REFERENCES "bank_statement_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bank_reconciliation_matches"
  ADD CONSTRAINT "bank_reconciliation_matches_accountMovementId_fkey"
  FOREIGN KEY ("accountMovementId") REFERENCES "account_movements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
