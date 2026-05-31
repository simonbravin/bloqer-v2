-- Phase 17B — scheduled email report configuration (CRUD only; no cron in this migration)

-- CreateEnum
CREATE TYPE "ScheduledReportScope" AS ENUM ('TENANT', 'PROJECT');

-- CreateEnum
CREATE TYPE "ScheduledReportStatus" AS ENUM ('ACTIVE', 'PAUSED', 'DELETED');

-- CreateEnum
CREATE TYPE "ScheduledReportFrequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "ScheduledReportFormat" AS ENUM ('CSV', 'PDF');

-- CreateEnum
CREATE TYPE "ScheduledReportRunStatus" AS ENUM ('SUCCESS', 'PARTIAL', 'FAILED', 'SKIPPED');

-- AlterEnum
ALTER TYPE "LinkedEntityType" ADD VALUE 'SCHEDULED_REPORT';

-- CreateTable
CREATE TABLE "scheduled_reports" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT,
    "projectId" TEXT,
    "scope" "ScheduledReportScope" NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "status" "ScheduledReportStatus" NOT NULL DEFAULT 'ACTIVE',
    "frequency" "ScheduledReportFrequency" NOT NULL,
    "dayOfWeek" INTEGER,
    "dayOfMonth" INTEGER,
    "timeOfDay" VARCHAR(5) NOT NULL,
    "timezone" VARCHAR(64) NOT NULL,
    "format" "ScheduledReportFormat" NOT NULL,
    "params" JSONB,
    "createdByUserId" TEXT NOT NULL,
    "lastRunAt" TIMESTAMP(3),
    "lastRunStatus" "ScheduledReportRunStatus",
    "nextRunAt" TIMESTAMP(3) NOT NULL,
    "runLockUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scheduled_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduled_report_items" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "scheduledReportId" TEXT NOT NULL,
    "reportKey" VARCHAR(64) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scheduled_report_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduled_report_recipients" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "scheduledReportId" TEXT NOT NULL,
    "recipientUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scheduled_report_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "scheduled_reports_tenantId_status_nextRunAt_idx" ON "scheduled_reports"("tenantId", "status", "nextRunAt");

-- CreateIndex
CREATE INDEX "scheduled_reports_tenantId_projectId_idx" ON "scheduled_reports"("tenantId", "projectId");

-- CreateIndex
CREATE INDEX "scheduled_reports_tenantId_createdByUserId_idx" ON "scheduled_reports"("tenantId", "createdByUserId");

-- CreateIndex
CREATE INDEX "scheduled_report_items_tenantId_scheduledReportId_idx" ON "scheduled_report_items"("tenantId", "scheduledReportId");

-- CreateIndex
CREATE UNIQUE INDEX "scheduled_report_items_scheduledReportId_reportKey_key" ON "scheduled_report_items"("scheduledReportId", "reportKey");

-- CreateIndex
CREATE INDEX "scheduled_report_recipients_tenantId_scheduledReportId_idx" ON "scheduled_report_recipients"("tenantId", "scheduledReportId");

-- CreateIndex
CREATE UNIQUE INDEX "scheduled_report_recipients_scheduledReportId_recipientUser_key" ON "scheduled_report_recipients"("scheduledReportId", "recipientUserId");

-- AddForeignKey
ALTER TABLE "scheduled_reports" ADD CONSTRAINT "scheduled_reports_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_reports" ADD CONSTRAINT "scheduled_reports_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_reports" ADD CONSTRAINT "scheduled_reports_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_reports" ADD CONSTRAINT "scheduled_reports_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_report_items" ADD CONSTRAINT "scheduled_report_items_scheduledReportId_fkey" FOREIGN KEY ("scheduledReportId") REFERENCES "scheduled_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_report_recipients" ADD CONSTRAINT "scheduled_report_recipients_scheduledReportId_fkey" FOREIGN KEY ("scheduledReportId") REFERENCES "scheduled_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_report_recipients" ADD CONSTRAINT "scheduled_report_recipients_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CHECK constraints
ALTER TABLE "scheduled_reports" ADD CONSTRAINT "scheduled_reports_scope_project_chk" CHECK (
    ("scope" = 'TENANT' AND "projectId" IS NULL)
    OR ("scope" = 'PROJECT' AND "projectId" IS NOT NULL)
);

ALTER TABLE "scheduled_reports" ADD CONSTRAINT "scheduled_reports_weekly_day_chk" CHECK (
    "frequency" <> 'WEEKLY'
    OR ("dayOfWeek" IS NOT NULL AND "dayOfWeek" >= 1 AND "dayOfWeek" <= 7)
);

ALTER TABLE "scheduled_reports" ADD CONSTRAINT "scheduled_reports_monthly_day_chk" CHECK (
    "frequency" <> 'MONTHLY'
    OR ("dayOfMonth" IS NOT NULL AND "dayOfMonth" >= 1 AND "dayOfMonth" <= 28)
);

ALTER TABLE "scheduled_reports" ADD CONSTRAINT "scheduled_reports_time_of_day_chk" CHECK (
    "timeOfDay" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
);

-- Idempotency for scheduled report emails (Phase 17D); safe for manual REPORT_MANUAL (no unique today)
CREATE UNIQUE INDEX "email_delivery_logs_scheduled_idempotency_sent"
ON "email_delivery_logs" ("tenantId", "idempotencyKey")
WHERE "status" = 'SENT'
  AND "emailType" = 'REPORT_SCHEDULED'
  AND "idempotencyKey" IS NOT NULL;
