-- Phase 14A: company contact / onboarding fields (trial tenant wizard).

ALTER TABLE "companies" ADD COLUMN     "address" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "country" TEXT NOT NULL DEFAULT 'AR',
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "website" VARCHAR(512),
ADD COLUMN     "industry" VARCHAR(128),
ADD COLUMN     "companySize" VARCHAR(64);
