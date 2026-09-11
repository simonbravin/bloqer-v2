-- [D-114] Email notification preferences + daily digest

ALTER TYPE "EmailDeliveryType" ADD VALUE IF NOT EXISTS 'NOTIFICATION_DIGEST';

DO $$ BEGIN
  CREATE TYPE "NotificationEmailCategory" AS ENUM (
    'PROCUREMENT_FLOW',
    'PROCUREMENT_ESCALATION',
    'AP_PAYMENT',
    'AR_COLLECTION',
    'AP_OVERDUE',
    'JOBSITE_LOG',
    'OPERATIONAL_OTHER',
    'DAILY_DIGEST'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "tenant_notification_email_policies" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "leadershipDailyFlowEmailCc" BOOLEAN NOT NULL DEFAULT false,
    "digestEnabledDefault" BOOLEAN NOT NULL DEFAULT true,
    "digestHourLocal" INTEGER NOT NULL DEFAULT 7,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_notification_email_policies_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "tenant_notification_email_policies_tenantId_key"
  ON "tenant_notification_email_policies"("tenantId");

DO $$ BEGIN
  ALTER TABLE "tenant_notification_email_policies"
    ADD CONSTRAINT "tenant_notification_email_policies_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "user_notification_email_preferences" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" "NotificationEmailCategory" NOT NULL,
    "emailEnabled" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_notification_email_preferences_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_notification_email_preferences_tenantId_userId_category_key"
  ON "user_notification_email_preferences"("tenantId", "userId", "category");

CREATE INDEX IF NOT EXISTS "user_notification_email_preferences_tenantId_userId_idx"
  ON "user_notification_email_preferences"("tenantId", "userId");

DO $$ BEGIN
  ALTER TABLE "user_notification_email_preferences"
    ADD CONSTRAINT "user_notification_email_preferences_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "user_notification_email_preferences"
    ADD CONSTRAINT "user_notification_email_preferences_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
