import { compareDecimal } from "@bloqer/utils";

/**
 * Field CxP filters. Deep-link: `?field=pending|overdue|upcoming|paid`.
 * Default mobile: `pending` (open balance).
 */
export type PayablesFieldFilterId = "pending" | "overdue" | "upcoming" | "paid";

export const PAYABLES_FIELD_FILTER_IDS: PayablesFieldFilterId[] = [
  "pending",
  "overdue",
  "upcoming",
  "paid",
];

/** Fetch cap for the Field list query (not `resolvePagination` / aging). */
export const PAYABLES_FIELD_FETCH_LIMIT = 500;

/** Display cap after filter + sort (same pattern as Materiales Field). */
export const PAYABLES_FIELD_LIST_LIMIT = 200;

/** Same cent threshold as `hasOpenObligationBalance` (D-053). Prisma-free for client. */
export const PAYABLES_FIELD_OPEN_BALANCE_EPSILON = "0.01";

/**
 * Derived urgency labels — not persisted.
 * Calendar comparison is UTC date (`YYYY-MM-DD`), same as AP aging / `isObligationOverdue`.
 */
export type PayablesFieldUrgency = "overdue" | "due_today" | "upcoming" | "paid" | "cancelled";

export const PAYABLES_FIELD_URGENCY_LABELS: Record<PayablesFieldUrgency, string> = {
  overdue: "Vencida",
  due_today: "Vence hoy",
  upcoming: "Próxima",
  paid: "Pagada",
  cancelled: "Cancelada",
};

export type PayablesFieldRow = {
  id: string;
  supplierName: string;
  supplierInvoiceId: string;
  supplierInvoiceCode: string | null;
  projectId: string | null;
  projectName: string | null;
  issueDateIso: string;
  dueDateIso: string;
  currency: string;
  originalAmount: string;
  paidAmount: string;
  balanceDue: string;
  status: string;
};

export function formatSupplierInvoiceCode(number: number | null | undefined): string | null {
  if (number == null) return null;
  return `FP-${String(number).padStart(5, "0")}`;
}

/** UTC calendar day as `YYYY-MM-DD` — matches AP aging, not product-TZ week helpers. */
export function payablesFieldTodayIso(now: Date = new Date()): string {
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

export function parsePayablesFieldFilter(
  raw: string | null | undefined,
): PayablesFieldFilterId | null {
  if (!raw) return null;
  const value = raw.trim().toLowerCase();
  if (PAYABLES_FIELD_FILTER_IDS.includes(value as PayablesFieldFilterId)) {
    return value as PayablesFieldFilterId;
  }
  return null;
}

export function payablesFieldHasOpenBalance(balanceDue: string): boolean {
  try {
    return compareDecimal(balanceDue, PAYABLES_FIELD_OPEN_BALANCE_EPSILON) >= 0;
  } catch {
    return false;
  }
}

export function isPayablesFieldOpen(
  row: Pick<PayablesFieldRow, "status" | "balanceDue">,
): boolean {
  if (row.status === "CANCELLED" || row.status === "PAID") return false;
  return payablesFieldHasOpenBalance(row.balanceDue);
}

export function payablesFieldUrgency(
  row: Pick<PayablesFieldRow, "status" | "balanceDue" | "dueDateIso">,
  todayIso: string,
): PayablesFieldUrgency {
  if (row.status === "CANCELLED") return "cancelled";
  if (!isPayablesFieldOpen(row)) return "paid";
  if (row.dueDateIso < todayIso) return "overdue";
  if (row.dueDateIso === todayIso) return "due_today";
  return "upcoming";
}

export function matchesPayablesFieldFilter(
  row: PayablesFieldRow,
  filter: PayablesFieldFilterId,
  todayIso: string,
): boolean {
  const urgency = payablesFieldUrgency(row, todayIso);
  switch (filter) {
    case "pending":
      return isPayablesFieldOpen(row);
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

export function matchesPayablesFieldSearch(
  row: Pick<PayablesFieldRow, "supplierName" | "supplierInvoiceCode">,
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = `${row.supplierName} ${row.supplierInvoiceCode ?? ""}`.toLowerCase();
  return hay.includes(q);
}

/** Overdue → due today → due date → larger balance → supplier. Not alpha-first. */
export function payablesFieldUrgencyRank(
  row: PayablesFieldRow,
  todayIso: string,
): number {
  const urgency = payablesFieldUrgency(row, todayIso);
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

export function comparePayablesFieldRows(
  a: PayablesFieldRow,
  b: PayablesFieldRow,
  todayIso: string,
): number {
  const rank = payablesFieldUrgencyRank(a, todayIso) - payablesFieldUrgencyRank(b, todayIso);
  if (rank !== 0) return rank;
  return (
    a.dueDateIso.localeCompare(b.dueDateIso) ||
    compareBalanceDesc(a.balanceDue, b.balanceDue) ||
    a.supplierName.localeCompare(b.supplierName, "es")
  );
}

export function filterAndSortPayablesFieldRows(
  rows: PayablesFieldRow[],
  filter: PayablesFieldFilterId,
  todayIso: string,
  searchQuery: string,
): PayablesFieldRow[] {
  return rows
    .filter((row) => matchesPayablesFieldFilter(row, filter, todayIso))
    .filter((row) => matchesPayablesFieldSearch(row, searchQuery))
    .sort((a, b) => comparePayablesFieldRows(a, b, todayIso));
}

export function limitPayablesFieldRows(rows: PayablesFieldRow[]): {
  visible: PayablesFieldRow[];
  truncated: boolean;
  matchedCount: number;
} {
  const matchedCount = rows.length;
  if (matchedCount <= PAYABLES_FIELD_LIST_LIMIT) {
    return { visible: rows, truncated: false, matchedCount };
  }
  return {
    visible: rows.slice(0, PAYABLES_FIELD_LIST_LIMIT),
    truncated: true,
    matchedCount,
  };
}

export type PayablesFieldKpis = {
  pending: number;
  overdue: number;
  upcoming: number;
  paid: number;
};

/** KPIs over the loaded set (before the 200 display cap). */
export function summarizePayablesFieldKpis(
  rows: PayablesFieldRow[],
  todayIso: string,
): PayablesFieldKpis {
  let pending = 0;
  let overdue = 0;
  let upcoming = 0;
  let paid = 0;
  for (const row of rows) {
    const urgency = payablesFieldUrgency(row, todayIso);
    if (isPayablesFieldOpen(row)) pending += 1;
    if (urgency === "overdue") overdue += 1;
    if (urgency === "due_today" || urgency === "upcoming") upcoming += 1;
    if (urgency === "paid") paid += 1;
  }
  return { pending, overdue, upcoming, paid };
}
