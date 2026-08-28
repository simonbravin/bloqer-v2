-- D-097: procurement overdue alerts (delivery, needed-by, received-without-invoice).
-- Adds three new NotificationType enum values and per-company grace/SLA/toggles.

ALTER TYPE "NotificationType" ADD VALUE 'PURCHASE_ORDER_DELIVERY_OVERDUE';
ALTER TYPE "NotificationType" ADD VALUE 'PURCHASE_REQUEST_NEEDED_BY_OVERDUE';
ALTER TYPE "NotificationType" ADD VALUE 'PURCHASE_ORDER_RECEIVED_WITHOUT_INVOICE';

ALTER TABLE "company_procurement_settings"
    ADD COLUMN "deliveryOverdueGraceDays" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "neededByOverdueGraceDays" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "receiptToInvoiceSlaDays" INTEGER NOT NULL DEFAULT 5,
    ADD COLUMN "deliveryAlertsEnabled" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN "neededByAlertsEnabled" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN "receiptToInvoiceAlertsEnabled" BOOLEAN NOT NULL DEFAULT true;
