import { ServiceError } from "../types";
import { computeDateRangePreset, toIsoDateInTimeZone } from "@bloqer/utils";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Accepts calendar YYYY-MM-DD only; rejects rollover dates (e.g. 2026-02-31). */
export function sanitizeIsoDate(value?: string | null): string | undefined {
  if (!value || !ISO_DATE.test(value)) return undefined;
  const d = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return undefined;
  if (d.toISOString().slice(0, 10) !== value) return undefined;
  return value;
}

export function defaultAccountingMonthRange(): { dateFrom: string; dateTo: string } {
  return computeDateRangePreset("month");
}

export function defaultAccountingAsOfDate(): string {
  return toIsoDateInTimeZone(new Date());
}

export function parseAccountingDateRange(input: {
  dateFrom?: string | null;
  dateTo?: string | null;
}): { dateFrom: string; dateTo: string } {
  const fallback = defaultAccountingMonthRange();
  const dateFrom = sanitizeIsoDate(input.dateFrom) ?? fallback.dateFrom;
  const dateTo = sanitizeIsoDate(input.dateTo) ?? fallback.dateTo;
  if (dateFrom > dateTo) {
    throw new ServiceError(
      "VALIDATION",
      "La fecha desde no puede ser posterior a la fecha hasta.",
    );
  }
  return { dateFrom, dateTo };
}

export function parseAccountingAsOfDate(asOfDate?: string | null): string {
  return sanitizeIsoDate(asOfDate) ?? defaultAccountingAsOfDate();
}

/** Prisma `@db.Date` inclusive bounds (UTC midnight of calendar day). */
export function entryDateGte(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

export function entryDateLte(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`);
}
