-- Q-013 + R-MAT-02: overhead allocations, company %, product on APU lines

ALTER TABLE "companies" ADD COLUMN "overheadAllocationPct" DECIMAL(8,4) NOT NULL DEFAULT 0;

CREATE TABLE "project_overhead_allocations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "period" VARCHAR(7) NOT NULL,
    "currency" VARCHAR(8) NOT NULL DEFAULT 'ARS',
    "amount" DECIMAL(18,4) NOT NULL,
    "notes" TEXT,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_overhead_allocations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "project_overhead_allocations_tenantId_projectId_period_key" ON "project_overhead_allocations"("tenantId", "projectId", "period");
CREATE INDEX "project_overhead_allocations_tenantId_companyId_idx" ON "project_overhead_allocations"("tenantId", "companyId");

ALTER TABLE "project_overhead_allocations" ADD CONSTRAINT "project_overhead_allocations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "project_overhead_allocations" ADD CONSTRAINT "project_overhead_allocations_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "project_overhead_allocations" ADD CONSTRAINT "project_overhead_allocations_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "cost_analysis_lines" ADD COLUMN "productId" TEXT;
CREATE INDEX "cost_analysis_lines_productId_idx" ON "cost_analysis_lines"("productId");
ALTER TABLE "cost_analysis_lines" ADD CONSTRAINT "cost_analysis_lines_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
