import { ServiceError } from "../types";

export function currentOverheadPeriod(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function periodToDateRange(period: string): { dateFrom: string; dateTo: string } {
  assertValidOverheadPeriod(period);
  const y = Number.parseInt(period.slice(0, 4), 10);
  const m = Number.parseInt(period.slice(5, 7), 10);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, "0");
  return {
    dateFrom: `${y}-${mm}-01`,
    dateTo: `${y}-${mm}-${String(lastDay).padStart(2, "0")}`,
  };
}

export function assertValidOverheadPeriod(period: string): void {
  if (!/^\d{4}-\d{2}$/.test(period)) {
    throw new ServiceError("VALIDATION", "Período inválido (use YYYY-MM)");
  }
  const month = Number.parseInt(period.slice(5, 7), 10);
  if (month < 1 || month > 12) {
    throw new ServiceError("VALIDATION", "Mes inválido en el período (01–12)");
  }
}

export type OverheadPeriodFilter = {
  periodFrom?: string;
  periodTo?: string;
};

/** Lista períodos YYYY-MM inclusivos; sin filtro → mes calendario actual (UTC). */
export function resolvePeriodKeysForFilter(filter?: OverheadPeriodFilter): string[] {
  if (!filter?.periodFrom && !filter?.periodTo) {
    return [currentOverheadPeriod()];
  }
  const from = filter.periodFrom ?? filter.periodTo!;
  const to = filter.periodTo ?? filter.periodFrom!;
  assertValidOverheadPeriod(from);
  assertValidOverheadPeriod(to);
  if (from > to) {
    throw new ServiceError("VALIDATION", "periodFrom no puede ser posterior a periodTo");
  }

  const keys: string[] = [];
  let y = Number.parseInt(from.slice(0, 4), 10);
  let m = Number.parseInt(from.slice(5, 7), 10);
  const endY = Number.parseInt(to.slice(0, 4), 10);
  const endM = Number.parseInt(to.slice(5, 7), 10);

  while (y < endY || (y === endY && m <= endM)) {
    keys.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
    if (keys.length > 120) {
      throw new ServiceError("VALIDATION", "Rango de períodos demasiado amplio (máx. 120 meses)");
    }
  }
  return keys;
}

/** Peso = parte / total; 0 si total es 0. */
export function computeWeightShare(part: string, total: string): string {
  const p = Number.parseFloat(part);
  const t = Number.parseFloat(total);
  if (!Number.isFinite(p) || !Number.isFinite(t) || t <= 0) return "0.00";
  return ((p / t) * 100).toFixed(2);
}
