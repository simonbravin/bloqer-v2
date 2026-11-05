import { formatDbDate } from "@bloqer/utils";

const monthFormat = new Intl.DateTimeFormat("es-AR", {
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

export function cashFlowPeriodLabel(period: string): string {
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
    return monthFormat.format(new Date(`${period}-01T00:00:00.000Z`));
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(period)) return formatDbDate(period);
  const week = /^(\d{4})-W(\d{2})$/.exec(period);
  if (week) return `Sem. ${week[2]} · ${week[1]}`;
  return period;
}
