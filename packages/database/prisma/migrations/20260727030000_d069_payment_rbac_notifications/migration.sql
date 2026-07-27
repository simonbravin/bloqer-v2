-- D-069: in-app notification types for payable ready-to-pay and payment confirmed
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'PAYABLE_READY_TO_PAY';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'PAYMENT_CONFIRMED';
