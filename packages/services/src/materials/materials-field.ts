import {
  addCalendarDays,
  calendarPartsInTimeZone,
  compareDecimal,
  formatCalendarDate,
  productWeekMondaySundayBounds,
  toIsoDateInTimeZone,
} from "@bloqer/utils";

/**
 * Field Materiales filters. Deep-link: `?field=shortfall|week|next_14_days|ordered|pending_receipt|all`.
 * Default mobile: `shortfall`.
 */
export type MaterialsFieldFilterId =
  | "shortfall"
  | "week"
  | "next_14_days"
  | "ordered"
  | "pending_receipt"
  | "all";

export const MATERIALS_FIELD_FILTER_IDS: MaterialsFieldFilterId[] = [
  "shortfall",
  "week",
  "next_14_days",
  "ordered",
  "pending_receipt",
  "all",
];

export const MATERIALS_FIELD_LIST_LIMIT = 200;

/** Derived supply labels — not persisted. Ordered/received come from the materials board. */
export type MaterialsFieldSupplyLabel = "sin_pedir" | "pedido" | "parcial" | "recibido";

export const MATERIALS_FIELD_SUPPLY_LABELS: Record<MaterialsFieldSupplyLabel, string> = {
  sin_pedir: "Sin pedir",
  pedido: "Pedido",
  parcial: "Parcial",
  recibido: "Recibido",
};

export type MaterialsFieldRow = {
  rowKey: string;
  wbsNodeId: string;
  wbsCode: string;
  wbsName: string;
  costAnalysisLineId: string | null;
  productId: string | null;
  productSku: string | null;
  description: string;
  unit: string | null;
  needQty: string;
  orderedQty: string;
  receivedQty: string;
  consumedQty: string;
  shortfallQty: string;
  pendingReceiptQty: string;
  requiredStart: string | null;
  requiredEnd: string | null;
  unscheduled: boolean;
  relatedPurchaseRequestId: string | null;
  relatedPurchaseRequestNumber: number | null;
  relatedPurchaseOrderId: string | null;
  relatedPurchaseOrderNumber: number | null;
};

export type MaterialsFieldWindow = {
  todayIso: string;
  weekStart: string;
  weekEnd: string;
  next14Start: string;
  next14End: string;
};

/** Product-TZ calendar window. Week is Monday–Sunday (same as Cronograma Field). */
export function materialsFieldWindow(now: Date = new Date()): MaterialsFieldWindow {
  const todayIso = toIsoDateInTimeZone(now);
  const { weekStart, weekEnd } = productWeekMondaySundayBounds(now);
  const today = calendarPartsInTimeZone(now);
  return {
    todayIso,
    weekStart,
    weekEnd,
    next14Start: todayIso,
    next14End: formatCalendarDate(addCalendarDays(today, 13)),
  };
}

export function parseMaterialsFieldFilter(
  raw: string | null | undefined,
): MaterialsFieldFilterId | null {
  if (!raw) return null;
  const value = raw.trim().toLowerCase();
  if (MATERIALS_FIELD_FILTER_IDS.includes(value as MaterialsFieldFilterId)) {
    return value as MaterialsFieldFilterId;
  }
  return null;
}

export function materialsFieldQtyGtZero(raw: string | null | undefined): boolean {
  if (raw == null || raw.trim() === "") return false;
  try {
    return compareDecimal(raw, "0") > 0;
  } catch {
    return false;
  }
}

/** Board shortfall: max(0, need − ordered). Ordered includes eligible PR/PO. */
export function isMaterialsFieldShortage(
  row: Pick<MaterialsFieldRow, "shortfallQty">,
): boolean {
  return materialsFieldQtyGtZero(row.shortfallQty);
}

/** Covered in board terms: need > 0 and ordered ≥ need (shortfall ≈ 0). Not warehouse stock. */
export function isMaterialsFieldCovered(
  row: Pick<MaterialsFieldRow, "needQty" | "shortfallQty">,
): boolean {
  return materialsFieldQtyGtZero(row.needQty) && !isMaterialsFieldShortage(row);
}

/** Pending inbound: ordered − received > 0 (board receivedQty from PO lines). */
export function isMaterialsFieldPendingReceipt(
  row: Pick<MaterialsFieldRow, "pendingReceiptQty">,
): boolean {
  return materialsFieldQtyGtZero(row.pendingReceiptQty);
}

export function materialsFieldSupplyLabel(
  row: Pick<MaterialsFieldRow, "orderedQty" | "receivedQty">,
): MaterialsFieldSupplyLabel {
  if (!materialsFieldQtyGtZero(row.orderedQty)) return "sin_pedir";
  const received = materialsFieldQtyGtZero(row.receivedQty);
  if (!received) return "pedido";
  try {
    if (compareDecimal(row.receivedQty, row.orderedQty) < 0) return "parcial";
  } catch {
    return "pedido";
  }
  return "recibido";
}

/**
 * Unique related document only when exactly one id is present.
 * 0 or >1 → null (keep Pedir; never guess by name).
 */
export function uniqueRelatedId(ids: Array<string | null | undefined>): string | null {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  return unique.length === 1 ? unique[0]! : null;
}

function calendarRangeOverlapsIsoDay(
  startDate: string | null,
  endDate: string | null,
  dayIso: string,
): boolean {
  const start = startDate ?? endDate;
  const end = endDate ?? startDate;
  if (!start || !end) return false;
  return start <= dayIso && dayIso <= end;
}

function calendarRangeOverlapsIsoRange(
  startDate: string | null,
  endDate: string | null,
  rangeStart: string,
  rangeEnd: string,
): boolean {
  const start = startDate ?? endDate;
  const end = endDate ?? startDate;
  if (!start || !end) return false;
  return start <= rangeEnd && end >= rangeStart;
}

export function rowInMaterialsFieldWeek(
  row: Pick<MaterialsFieldRow, "requiredStart" | "requiredEnd">,
  window: MaterialsFieldWindow,
): boolean {
  return calendarRangeOverlapsIsoRange(
    row.requiredStart,
    row.requiredEnd,
    window.weekStart,
    window.weekEnd,
  );
}

export function rowInMaterialsFieldNext14Days(
  row: Pick<MaterialsFieldRow, "requiredStart" | "requiredEnd">,
  window: MaterialsFieldWindow,
): boolean {
  return calendarRangeOverlapsIsoRange(
    row.requiredStart,
    row.requiredEnd,
    window.next14Start,
    window.next14End,
  );
}

export function rowMatchesMaterialsFieldFilter(
  row: MaterialsFieldRow,
  filter: MaterialsFieldFilterId,
  window: MaterialsFieldWindow,
): boolean {
  switch (filter) {
    case "shortfall":
      return isMaterialsFieldShortage(row);
    case "week":
      return rowInMaterialsFieldWeek(row, window);
    case "next_14_days":
      return rowInMaterialsFieldNext14Days(row, window);
    case "ordered":
      return materialsFieldQtyGtZero(row.orderedQty);
    case "pending_receipt":
      return isMaterialsFieldPendingReceipt(row);
    case "all":
      return true;
  }
}

export function matchesMaterialsFieldSearch(row: MaterialsFieldRow, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  if (row.description.toLowerCase().includes(needle)) return true;
  if (row.wbsCode.toLowerCase().includes(needle)) return true;
  if (row.wbsName.toLowerCase().includes(needle)) return true;
  return Boolean(row.productSku && row.productSku.toLowerCase().includes(needle));
}

/**
 * Urgency for Field lists (especially Faltantes):
 * 0 overdue (requiredEnd < today) → 1 today → 2 this week → 3 dated later → 4 unscheduled.
 */
export function materialsFieldUrgencyRank(
  row: Pick<MaterialsFieldRow, "requiredStart" | "requiredEnd" | "unscheduled">,
  window: MaterialsFieldWindow,
): number {
  if (row.unscheduled || (!row.requiredStart && !row.requiredEnd)) return 4;
  const end = row.requiredEnd ?? row.requiredStart;
  if (end && end < window.todayIso) return 0;
  if (calendarRangeOverlapsIsoDay(row.requiredStart, row.requiredEnd, window.todayIso)) return 1;
  if (rowInMaterialsFieldWeek(row, window)) return 2;
  return 3;
}

function compareQtyDesc(a: string, b: string): number {
  try {
    return compareDecimal(b, a);
  } catch {
    return 0;
  }
}

export function compareMaterialsFieldRows(
  a: MaterialsFieldRow,
  b: MaterialsFieldRow,
  window: MaterialsFieldWindow,
): number {
  const rank = materialsFieldUrgencyRank(a, window) - materialsFieldUrgencyRank(b, window);
  if (rank !== 0) return rank;
  const endA = a.requiredEnd ?? a.requiredStart ?? "9999-99-99";
  const endB = b.requiredEnd ?? b.requiredStart ?? "9999-99-99";
  return (
    endA.localeCompare(endB) ||
    compareQtyDesc(a.shortfallQty, b.shortfallQty) ||
    a.description.localeCompare(b.description, "es")
  );
}

export type MaterialsFieldKpis = {
  shortfall: number;
  week: number;
  ordered: number;
  pendingReceipt: number;
};

/** KPIs over the full board set (before the 200 display cap). */
export function summarizeMaterialsFieldKpis(
  rows: MaterialsFieldRow[],
  window: MaterialsFieldWindow,
): MaterialsFieldKpis {
  let shortfall = 0;
  let week = 0;
  let ordered = 0;
  let pendingReceipt = 0;
  for (const row of rows) {
    if (isMaterialsFieldShortage(row)) shortfall += 1;
    if (rowInMaterialsFieldWeek(row, window)) week += 1;
    if (materialsFieldQtyGtZero(row.orderedQty)) ordered += 1;
    if (isMaterialsFieldPendingReceipt(row)) pendingReceipt += 1;
  }
  return { shortfall, week, ordered, pendingReceipt };
}

export function filterAndSortMaterialsFieldRows(
  rows: MaterialsFieldRow[],
  filter: MaterialsFieldFilterId,
  window: MaterialsFieldWindow,
  search = "",
): MaterialsFieldRow[] {
  return rows
    .filter((row) => rowMatchesMaterialsFieldFilter(row, filter, window))
    .filter((row) => matchesMaterialsFieldSearch(row, search))
    .sort((a, b) => compareMaterialsFieldRows(a, b, window));
}

/**
 * Display cap. Always call **after** filter+sort so a shortfall past position 200
 * of "Todos" still appears in Faltantes.
 */
export function limitMaterialsFieldRows<T>(
  filteredSorted: T[],
  limit = MATERIALS_FIELD_LIST_LIMIT,
): { visible: T[]; truncated: boolean; matchedCount: number } {
  return {
    visible: filteredSorted.slice(0, limit),
    truncated: filteredSorted.length > limit,
    matchedCount: filteredSorted.length,
  };
}

/** Trim trailing zeros for SC quantity prefill (same as desktop Pedir). */
export function materialsFieldPrefillQuantity(raw: string): string {
  const t = raw.trim();
  if (!/^\d+(\.\d+)?$/.test(t)) return t;
  const [intPart, decPart] = t.split(".");
  const i = intPart ?? t;
  const trimmed = (decPart ?? "").replace(/0+$/, "").slice(0, 4);
  return trimmed ? `${i}.${trimmed}` : i;
}

export type MaterialsPedirPrefillRow = Pick<
  MaterialsFieldRow,
  "wbsNodeId" | "description" | "shortfallQty" | "productId" | "costAnalysisLineId" | "unit"
>;

/** Shared Pedir query (faltante + APU). Desktop uses `?create=1`; Field uses `/nueva`. */
export function materialsPedirQuery(row: MaterialsPedirPrefillRow): URLSearchParams {
  const q = new URLSearchParams();
  q.set("wbsNodeId", row.wbsNodeId);
  q.set("description", row.description);
  q.set("quantity", materialsFieldPrefillQuantity(row.shortfallQty));
  if (row.productId) q.set("productId", row.productId);
  if (row.costAnalysisLineId) q.set("costAnalysisLineId", row.costAnalysisLineId);
  if (row.unit) q.set("unit", row.unit);
  q.set("from", "materiales");
  return q;
}

export function materialsFieldPedirHref(projectId: string, row: MaterialsPedirPrefillRow): string {
  return `/proyectos/${projectId}/solicitudes-compra/nueva?${materialsPedirQuery(row).toString()}`;
}

export function materialsBoardPedirHref(projectId: string, row: MaterialsPedirPrefillRow): string {
  return `/proyectos/${projectId}/solicitudes-compra?create=1&${materialsPedirQuery(row).toString()}`;
}

/** When a unique SC/OC already exists, Pedir is for the remaining shortfall. */
export function materialsPedirCtaLabel(
  row: Pick<MaterialsFieldRow, "relatedPurchaseRequestId" | "relatedPurchaseOrderId">,
): string {
  return row.relatedPurchaseRequestId || row.relatedPurchaseOrderId ? "Pedir resto" : "Pedir";
}

/**
 * Pedir when there is remaining shortfall.
 * A unique related SC does not hide Pedir: that SC may only cover part of the need.
 */
export function canShowMaterialsFieldPedir(
  canRequest: boolean,
  row: Pick<MaterialsFieldRow, "shortfallQty">,
): boolean {
  return canRequest && isMaterialsFieldShortage(row);
}
