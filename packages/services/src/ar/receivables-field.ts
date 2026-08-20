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
 * Field CxC filters. Deep-link: `?field=pending|overdue|upcoming|paid`.
 * `paid` = Cobrada. Default mobile: `pending`.
 */
export type ReceivablesFieldFilterId = ObligationFieldFilterId;

export const RECEIVABLES_FIELD_FILTER_IDS: ReceivablesFieldFilterId[] = [
  "pending",
  "overdue",
  "upcoming",
  "paid",
];

export const RECEIVABLES_FIELD_FETCH_LIMIT = OBLIGATION_FIELD_FETCH_LIMIT;
export const RECEIVABLES_FIELD_LIST_LIMIT = OBLIGATION_FIELD_LIST_LIMIT;
export const RECEIVABLES_FIELD_OPEN_BALANCE_EPSILON = OBLIGATION_FIELD_OPEN_BALANCE_EPSILON;

export type ReceivablesFieldUrgency = ObligationFieldUrgency;

export const RECEIVABLES_FIELD_URGENCY_LABELS: Record<ReceivablesFieldUrgency, string> = {
  overdue: "Vencida",
  due_today: "Vence hoy",
  upcoming: "Próxima",
  paid: "Cobrada",
  cancelled: "Cancelada",
};

export type ReceivablesFieldRow = {
  id: string;
  clientName: string;
  salesInvoiceId: string;
  salesInvoiceCode: string | null;
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

function asSortable(row: ReceivablesFieldRow): ObligationFieldSortable {
  return {
    status: row.status,
    balanceDue: row.balanceDue,
    dueDateIso: row.dueDateIso,
    partyName: row.clientName,
  };
}

export function formatSalesInvoiceCode(number: number | null | undefined): string | null {
  if (number == null) return null;
  return `FAC-${String(number).padStart(5, "0")}`;
}

export function receivableFieldDetailHref(
  row: Pick<ReceivablesFieldRow, "id" | "projectId">,
): string {
  if (row.projectId) return `/proyectos/${row.projectId}/cuentas-por-cobrar/${row.id}`;
  return `/finanzas/cuentas-por-cobrar/${row.id}`;
}

export const receivablesFieldTodayIso = obligationFieldTodayIso;

export { utcIsoDate };

export const parseReceivablesFieldFilter = parseObligationFieldFilter;

export const receivablesFieldHasOpenBalance = obligationFieldHasOpenBalance;

export function isReceivablesFieldOpen(
  row: Pick<ReceivablesFieldRow, "status" | "balanceDue">,
): boolean {
  return isObligationFieldOpen(row);
}

export function receivablesFieldUrgency(
  row: Pick<ReceivablesFieldRow, "status" | "balanceDue" | "dueDateIso">,
  todayIso: string,
): ReceivablesFieldUrgency {
  return obligationFieldUrgency(row, todayIso);
}

export function matchesReceivablesFieldFilter(
  row: ReceivablesFieldRow,
  filter: ReceivablesFieldFilterId,
  todayIso: string,
): boolean {
  return matchesObligationFieldFilter(asSortable(row), filter, todayIso);
}

export function matchesReceivablesFieldSearch(
  row: Pick<ReceivablesFieldRow, "clientName" | "salesInvoiceCode">,
  query: string,
): boolean {
  return matchesObligationFieldSearch(row.clientName, row.salesInvoiceCode, query);
}

export function receivablesFieldUrgencyRank(
  row: ReceivablesFieldRow,
  todayIso: string,
): number {
  return obligationFieldUrgencyRank(asSortable(row), todayIso);
}

export function compareReceivablesFieldRows(
  a: ReceivablesFieldRow,
  b: ReceivablesFieldRow,
  todayIso: string,
): number {
  return compareObligationFieldRows(asSortable(a), asSortable(b), todayIso);
}

export function filterAndSortReceivablesFieldRows(
  rows: ReceivablesFieldRow[],
  filter: ReceivablesFieldFilterId,
  todayIso: string,
  searchQuery: string,
): ReceivablesFieldRow[] {
  return rows
    .filter((row) => matchesReceivablesFieldFilter(row, filter, todayIso))
    .filter((row) => matchesReceivablesFieldSearch(row, searchQuery))
    .sort((a, b) => compareReceivablesFieldRows(a, b, todayIso));
}

export function limitReceivablesFieldRows(rows: ReceivablesFieldRow[]): {
  visible: ReceivablesFieldRow[];
  truncated: boolean;
  matchedCount: number;
} {
  return limitObligationFieldRows(rows);
}

export type ReceivablesFieldKpis = ObligationFieldKpis;

export function summarizeReceivablesFieldKpis(
  rows: ReceivablesFieldRow[],
  todayIso: string,
): ReceivablesFieldKpis {
  return summarizeObligationFieldKpis(rows.map(asSortable), todayIso);
}
