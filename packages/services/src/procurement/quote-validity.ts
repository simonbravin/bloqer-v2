import { productCalendarDateUtc } from "@bloqer/utils";

/** validUntil is Prisma @db.Date, not an instant: compare product calendar days. */
export function isProcurementQuoteExpired(validUntil: Date | null, now = new Date()): boolean {
  return validUntil !== null && validUntil < productCalendarDateUtc(now);
}
