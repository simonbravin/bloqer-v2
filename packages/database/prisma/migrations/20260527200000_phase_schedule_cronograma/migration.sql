-- CreateEnum
CREATE TYPE "ScheduleType" AS ENUM ('GANTT', 'MILESTONES', 'HYBRID');

-- CreateEnum
CREATE TYPE "ScheduleItemType" AS ENUM ('TASK', 'MILESTONE');

-- CreateEnum
CREATE TYPE "ScheduleItemStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ScheduleDependencyType" AS ENUM ('FS');

-- CreateTable
CREATE TABLE "schedules" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "baselineBudgetId" TEXT,
    "type" "ScheduleType" NOT NULL DEFAULT 'HYBRID',
    "metadata" JSONB,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_items" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "parentId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "name" TEXT NOT NULL,
    "type" "ScheduleItemType" NOT NULL DEFAULT 'TASK',
    "startDate" DATE,
    "endDate" DATE,
    "durationDays" INTEGER,
    "progressPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "status" "ScheduleItemStatus" NOT NULL DEFAULT 'PLANNED',
    "blockReason" TEXT,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schedule_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_item_dependencies" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "predecessorId" TEXT NOT NULL,
    "successorId" TEXT NOT NULL,
    "type" "ScheduleDependencyType" NOT NULL DEFAULT 'FS',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "schedule_item_dependencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_item_wbs_links" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "scheduleItemId" TEXT NOT NULL,
    "wbsNodeId" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "schedule_item_wbs_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "schedules_projectId_key" ON "schedules"("projectId");

-- CreateIndex
CREATE INDEX "schedules_tenantId_projectId_idx" ON "schedules"("tenantId", "projectId");

-- CreateIndex
CREATE INDEX "schedule_items_scheduleId_parentId_sortOrder_idx" ON "schedule_items"("scheduleId", "parentId", "sortOrder");

-- CreateIndex
CREATE INDEX "schedule_items_tenantId_scheduleId_idx" ON "schedule_items"("tenantId", "scheduleId");

-- CreateIndex
CREATE UNIQUE INDEX "schedule_item_dependencies_predecessorId_successorId_key" ON "schedule_item_dependencies"("predecessorId", "successorId");

-- CreateIndex
CREATE INDEX "schedule_item_dependencies_tenantId_successorId_idx" ON "schedule_item_dependencies"("tenantId", "successorId");

-- CreateIndex
CREATE UNIQUE INDEX "schedule_item_wbs_links_scheduleItemId_wbsNodeId_key" ON "schedule_item_wbs_links"("scheduleItemId", "wbsNodeId");

-- CreateIndex
CREATE INDEX "schedule_item_wbs_links_wbsNodeId_idx" ON "schedule_item_wbs_links"("wbsNodeId");

-- CreateIndex
CREATE INDEX "schedule_item_wbs_links_tenantId_scheduleItemId_idx" ON "schedule_item_wbs_links"("tenantId", "scheduleItemId");

-- AddForeignKey
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_baselineBudgetId_fkey" FOREIGN KEY ("baselineBudgetId") REFERENCES "budgets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_items" ADD CONSTRAINT "schedule_items_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_items" ADD CONSTRAINT "schedule_items_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "schedule_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_item_dependencies" ADD CONSTRAINT "schedule_item_dependencies_predecessorId_fkey" FOREIGN KEY ("predecessorId") REFERENCES "schedule_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_item_dependencies" ADD CONSTRAINT "schedule_item_dependencies_successorId_fkey" FOREIGN KEY ("successorId") REFERENCES "schedule_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_item_wbs_links" ADD CONSTRAINT "schedule_item_wbs_links_scheduleItemId_fkey" FOREIGN KEY ("scheduleItemId") REFERENCES "schedule_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_item_wbs_links" ADD CONSTRAINT "schedule_item_wbs_links_wbsNodeId_fkey" FOREIGN KEY ("wbsNodeId") REFERENCES "wbs_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
