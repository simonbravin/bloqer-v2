/**
 * Overdue helpers for procurement listings ([D-097]).
 *
 * A CONFIRMED / PARTIALLY_RECEIVED PO is "delivery-overdue" once `expectedDeliveryDate` is before
 * today (UTC midnight). Displayed inline in tables/cards as a red badge with the day count.
 *
 * A SUBMITTED / QUOTE_SELECTED PR is "needed-by-overdue" once `neededByDate` is before today.
 * Grace days live in `CompanyProcurementSettings` and only affect alert *emission*: the visual
 * signal is deliberately literal so users see the miss the same day.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** UTC midnight of today, aligned to Prisma @db.Date semantics. */
function todayUtcMidnight(): number {
  const d = new Date();
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Whole days between a Date column and today's UTC midnight. Not overdue → 0. */
export function daysOverdueFromDate(reference: Date | null | undefined): number {
  if (!reference) return 0;
  const today = todayUtcMidnight();
  const ref = Date.UTC(
    reference.getUTCFullYear(),
    reference.getUTCMonth(),
    reference.getUTCDate(),
  );
  return Math.max(0, Math.floor((today - ref) / DAY_MS));
}

/** True when a PO status is still awaiting receipt (delivery matters). */
export function isPurchaseOrderAwaitingReceipt(status: string): boolean {
  return status === "CONFIRMED" || status === "PARTIALLY_RECEIVED";
}

/** True when a PR status is still open (needed-by matters). */
export function isPurchaseRequestOpen(status: string): boolean {
  return status === "SUBMITTED" || status === "QUOTE_SELECTED";
}

export function purchaseOrderDeliveryOverdueDays(
  status: string,
  expectedDeliveryDate: Date | null | undefined,
): number {
  if (!isPurchaseOrderAwaitingReceipt(status)) return 0;
  return daysOverdueFromDate(expectedDeliveryDate);
}

export function purchaseRequestNeededByOverdueDays(
  status: string,
  neededByDate: Date | null | undefined,
): number {
  if (!isPurchaseRequestOpen(status)) return 0;
  return daysOverdueFromDate(neededByDate);
}
