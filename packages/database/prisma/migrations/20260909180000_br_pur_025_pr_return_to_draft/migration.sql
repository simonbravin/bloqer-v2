-- [BR-PUR-025] PurchaseRequest return to draft + notification type

ALTER TABLE "purchase_requests" ADD COLUMN IF NOT EXISTS "returnReason" TEXT;
ALTER TABLE "purchase_requests" ADD COLUMN IF NOT EXISTS "returnedAt" TIMESTAMP(3);
ALTER TABLE "purchase_requests" ADD COLUMN IF NOT EXISTS "returnedByUserId" TEXT;

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'PURCHASE_REQUEST_RETURNED';
