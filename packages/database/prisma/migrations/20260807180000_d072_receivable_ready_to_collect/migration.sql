-- D-072: project receivable ready for company-finance collection
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'RECEIVABLE_READY_TO_COLLECT';
