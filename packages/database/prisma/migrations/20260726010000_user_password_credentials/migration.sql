-- AlterTable
ALTER TABLE "users" ADD COLUMN "passwordHash" TEXT,
ADD COLUMN "passwordUpdatedAt" TIMESTAMP(3);
