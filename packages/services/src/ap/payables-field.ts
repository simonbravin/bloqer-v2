import {
  compareObligationFieldRows,
  isObligationFieldOpen,
  limitObligationFieldRows,
  matchesObligationFieldFilter,
  matchesObligationFieldSearch,
  obligationFieldHasOpenBalance,
  obligationFieldTodayIso,
  obligationFieldUrgency,
  obligationFieldUrgencyRank,
  OBLIGATION_FIELD_FETCH_LIMIT,
  OBLIGATION_FIELD_LIST_LIMIT,
  OBLIGATION_FIELD_OPEN_BALANCE_EPSILON,
  parseObligationFieldFilter,
  summarizeObligationFieldKpis,
  utcIsoDate,
  type ObligationFieldFilterId,
  type ObligationFieldKpis,
  type ObligationFieldSortable,
  type ObligationFieldUrgency,
} from "../finance/obligation-field";

/**
 * Field CxP filters. Deep-link: `?field=pending|overdue|upcoming|paid`.
 * Default mobile: `pending` (open balance).
 */
export type PayablesFieldFilterId = ObligationFieldFilterId;

export const PAYABLES_FIELD_FILTER_IDS: PayablesFieldFilterId[] = [
  "pending",
  "overdue",
  "upcoming",
  "paid",
];

/** Fetch cap for the Field list query (not `resolvePagination` / aging). */
export const PAYABLES_FIELD_FETCH_LIMIT = OBLIGATION_FIELD_FETCH_LIMIT;

/** Display cap after filter + sort (same pattern as Materiales Field). */
export const PAYABLES_FIELD_LIST_LIMIT = OBLIGATION_FIELD_LIST_LIMIT;

/** Same cent threshold as `hasOpenObligationBalance` (D-053). Prisma-free for client. */
export const PAYABLES_FIELD_OPEN_BALANCE_EPSILON = OBLIGATION_FIELD_OPEN_BALANCE_EPSILON;

/**
 * Derived urgency labels — not persisted.
 * Calendar comparison is UTC date (`YYYY-MM-DD`), same as AP aging / `isObligationOverdue`.
 */
export type PayablesFieldUrgency = ObligationFieldUrgency;

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

function asSortable(row: PayablesFieldRow): ObligationFieldSortable {
  return {
    status: row.status,
    balanceDue: row.balanceDue,
    dueDateIso: row.dueDateIso,
    partyName: row.supplierName,
  };
}

export function formatSupplierInvoiceCode(number: number | null | undefined): string | null {
  if (number == null) return null;
  return `FP-${String(number).padStart(5, "0")}`;
}

/** UTC calendar day as `YYYY-MM-DD` — matches AP aging, not product-TZ week helpers. */
export const payablesFieldTodayIso = obligationFieldTodayIso;

export { utcIsoDate };

export const parsePayablesFieldFilter = parseObligationFieldFilter;

export const payablesFieldHasOpenBalance = obligationFieldHasOpenBalance;

export function isPayablesFieldOpen(
  row: Pick<PayablesFieldRow, "status" | "balanceDue">,
): boolean {
  return isObligationFieldOpen(row);
}

export function payablesFieldUrgency(
  row: Pick<PayablesFieldRow, "status" | "balanceDue" | "dueDateIso">,
  todayIso: string,
): PayablesFieldUrgency {
  return obligationFieldUrgency(row, todayIso);
}

export function matchesPayablesFieldFilter(
  row: PayablesFieldRow,
  filter: PayablesFieldFilterId,
  todayIso: string,
): boolean {
  return matchesObligationFieldFilter(asSortable(row), filter, todayIso);
}

export function matchesPayablesFieldSearch(
  row: Pick<PayablesFieldRow, "supplierName" | "supplierInvoiceCode">,
  query: string,
): boolean {
  return matchesObligationFieldSearch(row.supplierName, row.supplierInvoiceCode, query);
}

/** Overdue → due today → due date → larger balance → supplier. Not alpha-first. */
export function payablesFieldUrgencyRank(
  row: PayablesFieldRow,
  todayIso: string,
): number {
  return obligationFieldUrgencyRank(asSortable(row), todayIso);
}

export function comparePayablesFieldRows(
  a: PayablesFieldRow,
  b: PayablesFieldRow,
  todayIso: string,
): number {
  return compareObligationFieldRows(asSortable(a), asSortable(b), todayIso);
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
  return limitObligationFieldRows(rows);
}

export type PayablesFieldKpis = ObligationFieldKpis;

/** KPIs over the loaded set (before the 200 display cap). */
export function summarizePayablesFieldKpis(
  rows: PayablesFieldRow[],
  todayIso: string,
): PayablesFieldKpis {
  return summarizeObligationFieldKpis(rows.map(asSortable), todayIso);
}
