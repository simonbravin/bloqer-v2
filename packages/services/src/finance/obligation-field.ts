import { compareDecimal } from "@bloqer/utils";

/**
 * Shared Field obligation filters (CxP / CxC). Deep-link: `?field=pending|overdue|upcoming|paid`.
 * `paid` means settled (Pagada / Cobrada). Not a new persisted status.
 */
export type ObligationFieldFilterId = "pending" | "overdue" | "upcoming" | "paid";

export const OBLIGATION_FIELD_FILTER_IDS: ObligationFieldFilterId[] = [
  "pending",
  "overdue",
  "upcoming",
  "paid",
];

export const OBLIGATION_FIELD_FETCH_LIMIT = 500;
export const OBLIGATION_FIELD_LIST_LIMIT = 200;
export const OBLIGATION_FIELD_OPEN_BALANCE_EPSILON = "0.01";

export type ObligationFieldUrgency = "overdue" | "due_today" | "upcoming" | "paid" | "cancelled";

export type ObligationFieldSortable = {
  status: string;
  balanceDue: string;
  dueDateIso: string;
  partyName: string;
};

/** UTC calendar day as `YYYY-MM-DD` — matches AP/AR aging, not product-TZ week helpers. */
export function obligationFieldTodayIso(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function utcIsoDate(value: Date): string {
  const y = value.getUTCFullYear();
  const m = String(value.getUTCMonth() + 1).padStart(2, "0");
  const d = String(value.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseObligationFieldFilter(
  raw: string | null | undefined,
): ObligationFieldFilterId | null {
  if (!raw) return null;
  const value = raw.trim().toLowerCase();
  if (OBLIGATION_FIELD_FILTER_IDS.includes(value as ObligationFieldFilterId)) {
    return value as ObligationFieldFilterId;
  }
  return null;
}

export function obligationFieldHasOpenBalance(balanceDue: string): boolean {
  try {
    return compareDecimal(balanceDue, OBLIGATION_FIELD_OPEN_BALANCE_EPSILON) >= 0;
  } catch {
    return false;
  }
}

export function isObligationFieldOpen(
  row: Pick<ObligationFieldSortable, "status" | "balanceDue">,
): boolean {
  if (row.status === "CANCELLED" || row.status === "PAID") return false;
  return obligationFieldHasOpenBalance(row.balanceDue);
}

export function obligationFieldUrgency(
  row: Pick<ObligationFieldSortable, "status" | "balanceDue" | "dueDateIso">,
  todayIso: string,
): ObligationFieldUrgency {
  if (row.status === "CANCELLED") return "cancelled";
  if (!isObligationFieldOpen(row)) return "paid";
  if (row.dueDateIso < todayIso) return "overdue";
  if (row.dueDateIso === todayIso) return "due_today";
  return "upcoming";
}

export function matchesObligationFieldFilter(
  row: ObligationFieldSortable,
  filter: ObligationFieldFilterId,
  todayIso: string,
): boolean {
  const urgency = obligationFieldUrgency(row, todayIso);
  switch (filter) {
    case "pending":
      return isObligationFieldOpen(row);
    case "overdue":
      return urgency === "overdue";
    case "upcoming":
      return urgency === "due_today" || urgency === "upcoming";
    case "paid":
      return urgency === "paid";
    default:
      return false;
  }
}

export function matchesObligationFieldSearch(
  partyName: string,
  invoiceCode: string | null | undefined,
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return `${partyName} ${invoiceCode ?? ""}`.toLowerCase().includes(q);
}

export function obligationFieldUrgencyRank(
  row: ObligationFieldSortable,
  todayIso: string,
): number {
  const urgency = obligationFieldUrgency(row, todayIso);
  if (urgency === "overdue") return 0;
  if (urgency === "due_today") return 1;
  if (urgency === "upcoming") return 2;
  if (urgency === "paid") return 3;
  return 4;
}

function compareBalanceDesc(a: string, b: string): number {
  try {
    return compareDecimal(b, a);
  } catch {
    return 0;
  }
}

export function compareObligationFieldRows(
  a: ObligationFieldSortable,
  b: ObligationFieldSortable,
  todayIso: string,
): number {
  const rank = obligationFieldUrgencyRank(a, todayIso) - obligationFieldUrgencyRank(b, todayIso);
  if (rank !== 0) return rank;
  return (
    a.dueDateIso.localeCompare(b.dueDateIso) ||
    compareBalanceDesc(a.balanceDue, b.balanceDue) ||
    a.partyName.localeCompare(b.partyName, "es")
  );
}

export function limitObligationFieldRows<T>(rows: T[]): {
  visible: T[];
  truncated: boolean;
  matchedCount: number;
} {
  const matchedCount = rows.length;
  if (matchedCount <= OBLIGATION_FIELD_LIST_LIMIT) {
    return { visible: rows, truncated: false, matchedCount };
  }
  return {
    visible: rows.slice(0, OBLIGATION_FIELD_LIST_LIMIT),
    truncated: true,
    matchedCount,
  };
}

export type ObligationFieldKpis = {
  pending: number;
  overdue: number;
  upcoming: number;
  paid: number;
};

export function summarizeObligationFieldKpis(
  rows: ObligationFieldSortable[],
  todayIso: string,
): ObligationFieldKpis {
  let pending = 0;
  let overdue = 0;
  let upcoming = 0;
  let paid = 0;
  for (const row of rows) {
    const urgency = obligationFieldUrgency(row, todayIso);
    if (isObligationFieldOpen(row)) pending += 1;
    if (urgency === "overdue") overdue += 1;
    if (urgency === "due_today" || urgency === "upcoming") upcoming += 1;
    if (urgency === "paid") paid += 1;
  }
  return { pending, overdue, upcoming, paid };
}
