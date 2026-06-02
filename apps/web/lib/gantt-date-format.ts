import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

/** Display date as dd/MM/yyyy (Argentina). Accepts ISO date-only string or Date. */
export function formatDateAr(isoOrDate: string | Date | null | undefined): string {
  if (!isoOrDate) return "—";
  const d =
    typeof isoOrDate === "string"
      ? parseISO(isoOrDate.includes("T") ? isoOrDate : `${isoOrDate}T12:00:00.000Z`)
      : isoOrDate;
  if (Number.isNaN(d.getTime())) return "—";
  return format(d, "dd/MM/yyyy", { locale: es });
}

/** Human-readable duration in Spanish. */
export function formatDurationDaysAr(days: number | null | undefined): string {
  if (days == null || days <= 0) return "—";
  return days === 1 ? "1 día" : `${days} días`;
}

export { es as dateFnsLocaleEs };
