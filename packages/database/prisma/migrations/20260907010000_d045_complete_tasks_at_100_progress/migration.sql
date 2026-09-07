-- D-045: leaf TASK items already at 100% real progress must be COMPLETED.
-- Fixes rows stuck in IN_PROGRESS (or PLANNED) after one-shot libro/manual 100%,
-- which inflated “atrasados” (computeDaysLate ignores only COMPLETED/CANCELLED).
UPDATE "schedule_items" AS si
SET
  "status" = 'COMPLETED',
  "blockReason" = NULL,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE si."type" = 'TASK'
  AND si."progressPct" >= 100
  AND si."status" IN ('PLANNED', 'IN_PROGRESS')
  AND NOT EXISTS (
    SELECT 1
    FROM "schedule_items" AS child
    WHERE child."parentId" = si."id"
      AND child."status" <> 'CANCELLED'
  );
