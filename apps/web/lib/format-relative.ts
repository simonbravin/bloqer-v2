import { productCalendarDateUtc } from "@bloqer/utils";

export function formatRelativePast(date: Date | string, now: Date = new Date()): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "";
  const start = productCalendarDateUtc(d).getTime();
  const today = productCalendarDateUtc(now).getTime();
  const days = Math.floor((today - start) / 86_400_000);
  if (days <= 0) return "Hoy";
  if (days === 1) return "Hace 1 día";
  return `Hace ${days} días`;
}
