/**
 * Pure helpers for cronograma PDF/XLSX export.
 * Date-only ISO (YYYY-MM-DD) is formatted as dd/MM/yyyy without TZ shift.
 */

const MS_PER_DAY = 86_400_000;

export const SCHEDULE_EXPORT_STATUS_LABELS: Record<string, string> = {
  PLANNED: "Planificado",
  IN_PROGRESS: "En curso",
  BLOCKED: "Bloqueado",
  COMPLETED: "Hecho",
  CANCELLED: "Cancelado",
};

const MONTHS_SHORT_ES = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
] as const;

export type ScheduleExportView = "gantt" | "table" | "both";

export type ScheduleGanttScale = "weekly" | "monthly" | "quarterly";

export type ScheduleGanttPeriod = {
  key: string;
  label: string;
  startIso: string;
  endIso: string;
};

export type GanttBarFraction = {
  left: number;
  width: number;
};

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})/;

export function formatScheduleExportDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const m = ISO_DATE_RE.exec(iso.trim());
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

export function parseScheduleExportView(raw: string | undefined | null): ScheduleExportView {
  if (raw === "gantt" || raw === "table") return raw;
  return "both";
}

export function scheduleExportTypeLabel(item: { type: string; isLeaf: boolean }): string {
  if (item.type === "MILESTONE") return "Hito";
  if (!item.isLeaf) return "Contenedor";
  return "Tarea";
}

export function indentScheduleExportName(name: string, treeDepth: number): string {
  const depth = Number.isFinite(treeDepth) ? Math.max(0, Math.floor(treeDepth)) : 0;
  return `${"  ".repeat(depth)}${name}`;
}

export function filterScheduleItemsForExport<T extends { status: string }>(
  items: T[],
  statusFilter: string | undefined,
): T[] {
  if (statusFilter) return items.filter((i) => i.status === statusFilter);
  return items.filter((i) => i.status !== "CANCELLED");
}

export function formatScheduleExportPct(raw: string | null | undefined): string {
  if (raw == null || raw === "") return "—";
  return `${raw.replace(".", ",")}%`;
}

export function utcDateFromIsoDateOnly(iso: string): Date | null {
  const m = ISO_DATE_RE.exec(iso.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const month = Number(m[2]);
  const d = Number(m[3]);
  if (!y || month < 1 || month > 12 || d < 1 || d > 31) return null;
  return new Date(Date.UTC(y, month - 1, d));
}

export function isoDateOnlyFromUtc(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addUtcDays(d: Date, days: number): Date {
  const out = new Date(d.getTime());
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

/** Signed calendar-day difference (UTC date-only). Same day → 0. */
export function diffUtcDays(from: Date, to: Date): number {
  const a = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const b = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  return Math.round((b - a) / MS_PER_DAY);
}

export function computeExportDateRange(
  items: Array<{ startDate: string | null; endDate: string | null }>,
  padDays = 7,
): { startIso: string; endIso: string } | null {
  let min: Date | null = null;
  let max: Date | null = null;
  for (const item of items) {
    const start = item.startDate ? utcDateFromIsoDateOnly(item.startDate) : null;
    const end = item.endDate ? utcDateFromIsoDateOnly(item.endDate) : null;
    const a = start ?? end;
    const b = end ?? start;
    if (!a || !b) continue;
    if (!min || a < min) min = a;
    if (!max || b > max) max = b;
  }
  if (!min || !max) return null;
  return {
    startIso: isoDateOnlyFromUtc(addUtcDays(min, -padDays)),
    endIso: isoDateOnlyFromUtc(addUtcDays(max, padDays)),
  };
}

/**
 * Inclusive bar as 0–1 fractions of [rangeStart, rangeEnd].
 * Clips to the window so a bar that starts before / ends after does not leak.
 * A one-day task occupies 1 / spanDays.
 */
export function ganttBarFraction(
  startIso: string | null,
  endIso: string | null,
  rangeStartIso: string,
  rangeEndIso: string,
): GanttBarFraction | null {
  const start = startIso ? utcDateFromIsoDateOnly(startIso) : endIso ? utcDateFromIsoDateOnly(endIso) : null;
  const end = endIso ? utcDateFromIsoDateOnly(endIso) : startIso ? utcDateFromIsoDateOnly(startIso) : null;
  const rangeStart = utcDateFromIsoDateOnly(rangeStartIso);
  const rangeEnd = utcDateFromIsoDateOnly(rangeEndIso);
  if (!start || !end || !rangeStart || !rangeEnd) return null;
  const clippedStartMs = Math.max(start.getTime(), rangeStart.getTime());
  const clippedEndMs = Math.min(end.getTime(), rangeEnd.getTime());
  if (clippedStartMs > clippedEndMs) return null;
  const clippedStart = new Date(clippedStartMs);
  const clippedEnd = new Date(clippedEndMs);
  const spanDays = diffUtcDays(rangeStart, rangeEnd) + 1;
  if (spanDays <= 0) return null;
  const left = diffUtcDays(rangeStart, clippedStart) / spanDays;
  const width = (diffUtcDays(clippedStart, clippedEnd) + 1) / spanDays;
  if (width <= 0) return null;
  return { left, width };
}

export type DateWindow = { startIso: string; endIso: string };

/** Horizontal PDF pages: keep a readable number of periods per landscape sheet. */
export function splitGanttPdfWindows(
  rangeStartIso: string,
  rangeEndIso: string,
  scale: ScheduleGanttScale,
): DateWindow[] {
  const maxPeriods = scale === "weekly" ? 12 : scale === "monthly" ? 6 : 4;
  const all = buildGanttPeriods(rangeStartIso, rangeEndIso, scale);
  if (all.length === 0) return [{ startIso: rangeStartIso, endIso: rangeEndIso }];
  const windows: DateWindow[] = [];
  for (let i = 0; i < all.length; i += maxPeriods) {
    const slice = all.slice(i, i + maxPeriods);
    windows.push({
      startIso: slice[0]!.startIso,
      endIso: slice[slice.length - 1]!.endIso,
    });
  }
  const first = windows[0];
  const last = windows[windows.length - 1];
  if (first) first.startIso = rangeStartIso;
  if (last) last.endIso = rangeEndIso;
  return windows;
}

/** Excel serial day (1900 date system) for a YYYY-MM-DD. */
export function excelSerialFromIsoDateOnly(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const d = utcDateFromIsoDateOnly(iso);
  if (!d) return null;
  const epoch = Date.UTC(1899, 11, 30);
  return Math.round((d.getTime() - epoch) / 86_400_000);
}

export function todayMarkerFraction(rangeStartIso: string, rangeEndIso: string, todayIso: string): number | null {
  const rangeStart = utcDateFromIsoDateOnly(rangeStartIso);
  const rangeEnd = utcDateFromIsoDateOnly(rangeEndIso);
  const today = utcDateFromIsoDateOnly(todayIso);
  if (!rangeStart || !rangeEnd || !today) return null;
  if (today < rangeStart || today > rangeEnd) return null;
  const spanDays = diffUtcDays(rangeStart, rangeEnd) + 1;
  if (spanDays <= 0) return null;
  return diffUtcDays(rangeStart, today) / spanDays;
}

export type ScheduleAxisTick = {
  iso: string;
  label: string;
  left: number;
};

export function buildGanttAxisTicks(rangeStartIso: string, rangeEndIso: string): ScheduleAxisTick[] {
  const rangeStart = utcDateFromIsoDateOnly(rangeStartIso);
  const rangeEnd = utcDateFromIsoDateOnly(rangeEndIso);
  if (!rangeStart || !rangeEnd) return [];
  const spanDays = diffUtcDays(rangeStart, rangeEnd) + 1;
  if (spanDays <= 0) return [];

  const ticks: ScheduleAxisTick[] = [];
  const cursor = new Date(Date.UTC(rangeStart.getUTCFullYear(), rangeStart.getUTCMonth(), 1));
  if (cursor < rangeStart) {
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  while (cursor <= rangeEnd) {
    const iso = isoDateOnlyFromUtc(cursor);
    const left = Math.min(1, Math.max(0, diffUtcDays(rangeStart, cursor) / Math.max(1, spanDays - 1)));
    ticks.push({
      iso,
      label: `${MONTHS_SHORT_ES[cursor.getUTCMonth()]} ${cursor.getUTCFullYear()}`,
      left,
    });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  if (ticks.length === 0) {
    ticks.push({
      iso: rangeStartIso,
      label: `${MONTHS_SHORT_ES[rangeStart.getUTCMonth()]} ${rangeStart.getUTCFullYear()}`,
      left: 0,
    });
  }
  return ticks;
}

export function chooseGanttScale(rangeStartIso: string, rangeEndIso: string, maxPeriods = 52): ScheduleGanttScale {
  const start = utcDateFromIsoDateOnly(rangeStartIso);
  const end = utcDateFromIsoDateOnly(rangeEndIso);
  if (!start || !end) return "monthly";
  const days = diffUtcDays(start, end) + 1;
  const weeks = Math.ceil(days / 7);
  const months =
    (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    (end.getUTCMonth() - start.getUTCMonth()) +
    1;
  if (weeks <= maxPeriods && days <= 26 * 7) return "weekly";
  if (months <= maxPeriods) return "monthly";
  return "quarterly";
}

function startOfUtcWeekMonday(d: Date): Date {
  const day = d.getUTCDay(); // 0 Sun … 6 Sat
  const offset = day === 0 ? -6 : 1 - day;
  return addUtcDays(d, offset);
}

function startOfUtcQuarter(d: Date): Date {
  const q = Math.floor(d.getUTCMonth() / 3) * 3;
  return new Date(Date.UTC(d.getUTCFullYear(), q, 1));
}

export function buildGanttPeriods(
  rangeStartIso: string,
  rangeEndIso: string,
  scale: ScheduleGanttScale,
): ScheduleGanttPeriod[] {
  const rangeStart = utcDateFromIsoDateOnly(rangeStartIso);
  const rangeEnd = utcDateFromIsoDateOnly(rangeEndIso);
  if (!rangeStart || !rangeEnd) return [];

  const periods: ScheduleGanttPeriod[] = [];

  if (scale === "weekly") {
    let cursor = startOfUtcWeekMonday(rangeStart);
    while (cursor <= rangeEnd) {
      const end = addUtcDays(cursor, 6);
      periods.push({
        key: isoDateOnlyFromUtc(cursor),
        label: formatScheduleExportDate(isoDateOnlyFromUtc(cursor)),
        startIso: isoDateOnlyFromUtc(cursor),
        endIso: isoDateOnlyFromUtc(end),
      });
      cursor = addUtcDays(cursor, 7);
    }
    return periods;
  }

  if (scale === "quarterly") {
    let cursor = startOfUtcQuarter(rangeStart);
    while (cursor <= rangeEnd) {
      const end = addUtcDays(new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 3, 1)), -1);
      const q = Math.floor(cursor.getUTCMonth() / 3) + 1;
      periods.push({
        key: `${cursor.getUTCFullYear()}-Q${q}`,
        label: `T${q} ${cursor.getUTCFullYear()}`,
        startIso: isoDateOnlyFromUtc(cursor),
        endIso: isoDateOnlyFromUtc(end),
      });
      cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 3, 1));
    }
    return periods;
  }

  let cursor = new Date(Date.UTC(rangeStart.getUTCFullYear(), rangeStart.getUTCMonth(), 1));
  while (cursor <= rangeEnd) {
    const end = addUtcDays(new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1)), -1);
    periods.push({
      key: isoDateOnlyFromUtc(cursor).slice(0, 7),
      label: `${MONTHS_SHORT_ES[cursor.getUTCMonth()]} ${cursor.getUTCFullYear()}`,
      startIso: isoDateOnlyFromUtc(cursor),
      endIso: isoDateOnlyFromUtc(end),
    });
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
  }
  return periods;
}

export function periodOverlapsItem(
  period: Pick<ScheduleGanttPeriod, "startIso" | "endIso">,
  startIso: string | null,
  endIso: string | null,
): boolean {
  const itemStart = startIso ? utcDateFromIsoDateOnly(startIso) : endIso ? utcDateFromIsoDateOnly(endIso) : null;
  const itemEnd = endIso ? utcDateFromIsoDateOnly(endIso) : startIso ? utcDateFromIsoDateOnly(startIso) : null;
  const pStart = utcDateFromIsoDateOnly(period.startIso);
  const pEnd = utcDateFromIsoDateOnly(period.endIso);
  if (!itemStart || !itemEnd || !pStart || !pEnd) return false;
  return itemStart <= pEnd && itemEnd >= pStart;
}

export function buildScheduleExportFilterLine(input: {
  budgetName?: string;
  status?: string;
  delayedOnly?: boolean;
  itemType?: string;
}): string {
  const parts: string[] = [];
  if (input.budgetName) parts.push(`Presupuesto: ${input.budgetName}`);
  if (input.itemType === "TASK") parts.push("Tipo: Tareas");
  if (input.itemType === "MILESTONE") parts.push("Tipo: Hitos");
  if (input.status) {
    parts.push(`Estado: ${SCHEDULE_EXPORT_STATUS_LABELS[input.status] ?? input.status}`);
  } else {
    parts.push("Estado: Activos (sin canceladas)");
  }
  if (input.delayedOnly) parts.push("Solo atrasados");
  return parts.join(" · ");
}

export type ScheduleExportRow = {
  id: string;
  displayName: string;
  typeLabel: string;
  type: string;
  isLeaf: boolean;
  isMilestone: boolean;
  statusLabel: string;
  wbsCode: string;
  startDate: string | null;
  endDate: string | null;
  startLabel: string;
  endLabel: string;
  durationLabel: string;
  realPct: string;
  planPct: string;
  qtyPct: string;
  certPct: string;
  budgetLabel: string;
  committedLabel: string;
  alerts: string;
  treeDepth: number;
  barColor: string;
  progressRatio: number;
};

export type ScheduleExportGantt = {
  rangeStartIso: string;
  rangeEndIso: string;
  todayIso: string;
  todayLeft: number | null;
  axisTicks: ScheduleAxisTick[];
  scale: ScheduleGanttScale;
  periods: ScheduleGanttPeriod[];
};

export type ScheduleExportPayload = {
  projectId: string;
  budgetName: string;
  budgetCurrency: string;
  filterLine: string;
  view: ScheduleExportView;
  orgLine: string;
  projectLabel: string;
  generatedAtIso: string;
  summaryLine: string;
  rows: ScheduleExportRow[];
  gantt: ScheduleExportGantt | null;
};

