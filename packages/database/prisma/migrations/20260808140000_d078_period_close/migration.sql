-- D-014 / D-078: financial period close (treasury + GL)

CREATE TYPE "PeriodStatus" AS ENUM ('OPEN', 'CLOSED');

CREATE TABLE "periods" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "periodKey" VARCHAR(7) NOT NULL,
  "startDate" DATE NOT NULL,
  "endDate" DATE NOT NULL,
  "status" "PeriodStatus" NOT NULL DEFAULT 'OPEN',
  "closedAt" TIMESTAMP(3),
  "closedByUserId" TEXT,
  "lastReopenReason" VARCHAR(1024),
  "lastReopenedAt" TIMESTAMP(3),
  "lastReopenedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "periods_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "periods_tenantId_companyId_periodKey_key" ON "periods"("tenantId", "companyId", "periodKey");
CREATE INDEX "periods_tenantId_companyId_status_idx" ON "periods"("tenantId", "companyId", "status");
CREATE INDEX "periods_tenantId_companyId_startDate_endDate_idx" ON "periods"("tenantId", "companyId", "startDate", "endDate");

ALTER TABLE "periods" ADD CONSTRAINT "periods_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "periods" ADD CONSTRAINT "periods_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
