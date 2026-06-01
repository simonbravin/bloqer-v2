-- D-043: cierre de período AUTO_WEIGHT + snapshots por proyecto

CREATE TYPE "OverheadPeriodCloseStatus" AS ENUM ('OPEN', 'FROZEN');

CREATE TABLE "overhead_period_closes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "period" VARCHAR(7) NOT NULL,
    "status" "OverheadPeriodCloseStatus" NOT NULL DEFAULT 'OPEN',
    "poolArs" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "totalCdArs" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "frozenAt" TIMESTAMP(3),
    "frozenBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "overhead_period_closes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "overhead_auto_period_snapshots" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "period" VARCHAR(7) NOT NULL,
    "projectId" TEXT NOT NULL,
    "periodCloseId" TEXT NOT NULL,
    "allocatedAmount" DECIMAL(18,4) NOT NULL,
    "weightPct" DECIMAL(8,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "overhead_auto_period_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "overhead_period_closes_tenantId_companyId_period_key" ON "overhead_period_closes"("tenantId", "companyId", "period");
CREATE INDEX "overhead_period_closes_tenantId_companyId_idx" ON "overhead_period_closes"("tenantId", "companyId");

CREATE UNIQUE INDEX "overhead_auto_period_snapshots_tenantId_companyId_period_projectId_key" ON "overhead_auto_period_snapshots"("tenantId", "companyId", "period", "projectId");
CREATE INDEX "overhead_auto_period_snapshots_tenantId_companyId_period_idx" ON "overhead_auto_period_snapshots"("tenantId", "companyId", "period");
CREATE INDEX "overhead_auto_period_snapshots_periodCloseId_idx" ON "overhead_auto_period_snapshots"("periodCloseId");

ALTER TABLE "overhead_period_closes" ADD CONSTRAINT "overhead_period_closes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "overhead_period_closes" ADD CONSTRAINT "overhead_period_closes_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "overhead_auto_period_snapshots" ADD CONSTRAINT "overhead_auto_period_snapshots_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "overhead_auto_period_snapshots" ADD CONSTRAINT "overhead_auto_period_snapshots_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "overhead_auto_period_snapshots" ADD CONSTRAINT "overhead_auto_period_snapshots_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "overhead_auto_period_snapshots" ADD CONSTRAINT "overhead_auto_period_snapshots_periodCloseId_fkey" FOREIGN KEY ("periodCloseId") REFERENCES "overhead_period_closes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
