export function monthKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  return new Date(Date.UTC(+y!, +m! - 1, 1)).toLocaleDateString("es-AR", {
    month: "short",
    year: "numeric",
  });
}

export function defaultReportDateRange(monthsBack = 12): { dateFrom: string; dateTo: string } {
  const to = new Date();
  const from = new Date(to);
  from.setUTCMonth(from.getUTCMonth() - monthsBack);
  return {
    dateFrom: from.toISOString().slice(0, 10),
    dateTo: to.toISOString().slice(0, 10),
  };
}

export function parseFilterDate(s: string, endOfDay: boolean): Date {
  return new Date(`${s}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
}

export function inDateRange(d: Date, dateFrom?: string, dateTo?: string): boolean {
  if (dateFrom && d < parseFilterDate(dateFrom, false)) return false;
  if (dateTo && d > parseFilterDate(dateTo, true)) return false;
  return true;
}

/** Payables/receivables due on or before horizon end (includes overdue + upcoming). */
export function isDueOnOrBeforeHorizon(dueDate: Date, dateTo: string): boolean {
  return dueDate <= parseFilterDate(dateTo, true);
}

/**
 * Month bucket for projection charts.
 * Overdue items (due before horizon start) roll into the first month of the horizon.
 */
export function projectionBucketKey(dueDate: Date, dateFrom: string, dateTo: string): string | null {
  if (!isDueOnOrBeforeHorizon(dueDate, dateTo)) return null;
  const horizonStart = parseFilterDate(dateFrom, false);
  const bucketDate = dueDate < horizonStart ? horizonStart : dueDate;
  return monthKey(bucketDate);
}

export function projectionHorizon(daysAhead = 90): { dateFrom: string; dateTo: string } {
  const from = new Date();
  const to = new Date(from);
  to.setUTCDate(to.getUTCDate() + daysAhead);
  return {
    dateFrom: from.toISOString().slice(0, 10),
    dateTo: to.toISOString().slice(0, 10),
  };
}
