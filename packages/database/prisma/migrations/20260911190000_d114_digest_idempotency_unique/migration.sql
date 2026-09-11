-- [D-114] Claim-style uniqueness for daily notification digests.
-- Allows FAILED retries; blocks concurrent PENDING/SENT and empty-day SKIPPED duplicates.
-- email_not_configured SKIPPED is intentionally excluded so catch-up can retry after Resend is configured.

CREATE UNIQUE INDEX IF NOT EXISTS "email_delivery_logs_notification_digest_idempotency"
ON "email_delivery_logs" ("tenantId", "idempotencyKey")
WHERE "emailType" = 'NOTIFICATION_DIGEST'
  AND "idempotencyKey" IS NOT NULL
  AND (
    "status" IN ('PENDING', 'SENT')
    OR ("status" = 'SKIPPED' AND "skippedReason" = 'digest_empty')
  );
