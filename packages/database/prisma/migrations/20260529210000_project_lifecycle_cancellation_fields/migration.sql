-- AlterTable: project lifecycle cancellation metadata (D-042)
ALTER TABLE "projects" ADD COLUMN "statusBeforeCancellation" "ProjectStatus";
ALTER TABLE "projects" ADD COLUMN "cancellationReason" TEXT;
ALTER TABLE "projects" ADD COLUMN "cancelledAt" TIMESTAMP(3);
