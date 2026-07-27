-- D-070: company setting for AP payment alert channel (in-app vs in-app+email)
CREATE TYPE "ApPaymentNotificationChannel" AS ENUM ('IN_APP', 'IN_APP_AND_EMAIL');

ALTER TABLE "company_procurement_settings"
ADD COLUMN "apPaymentNotificationChannel" "ApPaymentNotificationChannel" NOT NULL DEFAULT 'IN_APP_AND_EMAIL';
