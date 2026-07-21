-- D-050 procurement alignment: ALTER existing tables/enums only (no new tables).

-- Notification types for PO lifecycle + SLA (idempotent)
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'PURCHASE_ORDER_APPROVED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'PURCHASE_ORDER_RETURNED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'PURCHASE_ORDER_CONFIRMED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'PROCUREMENT_SLA_REMINDER';

-- Quote lead time (comparable delivery days)
ALTER TABLE "procurement_quotes"
  ADD COLUMN IF NOT EXISTS "leadTimeDays" INTEGER;

-- PO emergency / return fields
ALTER TABLE "purchase_orders"
  ADD COLUMN IF NOT EXISTS "emergencyReason" TEXT;

ALTER TABLE "purchase_orders"
  ADD COLUMN IF NOT EXISTS "returnReason" TEXT;

ALTER TABLE "purchase_orders"
  ADD COLUMN IF NOT EXISTS "returnedAt" TIMESTAMP(3);

ALTER TABLE "purchase_orders"
  ADD COLUMN IF NOT EXISTS "returnedByUserId" TEXT;

-- SLA hours on company procurement settings
ALTER TABLE "company_procurement_settings"
  ADD COLUMN IF NOT EXISTS "approvalSlaHours" INTEGER NOT NULL DEFAULT 72;
