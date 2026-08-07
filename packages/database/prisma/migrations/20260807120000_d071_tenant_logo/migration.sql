-- D-071: Tenant brand logo (R2 key + mime on tenants)
ALTER TABLE "tenants" ADD COLUMN "logoStorageKey" VARCHAR(512);
ALTER TABLE "tenants" ADD COLUMN "logoMimeType" VARCHAR(128);
