-- D-063: in-app nudge for accounting DRAFT queue (EDIT ACCOUNTING audience).
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'ACCOUNTING_DRAFTS_PENDING';
