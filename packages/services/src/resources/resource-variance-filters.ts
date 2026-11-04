import { ServiceError } from "../types";

/** Validate date-only report bounds before passing them to Prisma. */
export function validateResourceVarianceDates(filters: { dateFrom?: string; dateTo?: string }): void {
  for (const value of [filters.dateFrom, filters.dateTo]) {
    if (!value) continue;
    const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00Z`) : null;
    if (!parsed || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
      throw new ServiceError("VALIDATION", "Ingresá fechas válidas con formato AAAA-MM-DD.");
    }
  }
  if (filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo) {
    throw new ServiceError("VALIDATION", "La fecha inicial debe ser anterior o igual a la fecha final.");
  }
}
