/**
 * Client-safe labels for Pendientes / compras stages.
 * Keep free of Prisma / server-only so web UI can import via
 * `@bloqer/services/field-pending-labels`.
 */

export type FieldPendingComprasStageSource =
  | "PURCHASE_REQUEST"
  | "PURCHASE_ORDER"
  | "PURCHASE_ORDER_CONFIRM"
  | "PURCHASE_ORDER_RECEIPT"
  | "PURCHASE_ORDER_INVOICE";

export const FIELD_PENDING_COMPRAS_STAGE_LABEL: Record<FieldPendingComprasStageSource, string> = {
  PURCHASE_REQUEST: "Cotizar",
  PURCHASE_ORDER: "Aprobación",
  PURCHASE_ORDER_CONFIRM: "Confirmar",
  PURCHASE_ORDER_RECEIPT: "Recibir",
  PURCHASE_ORDER_INVOICE: "Facturar",
};

export function fieldPendingComprasStageLabel(source: string): string | null {
  return (
    FIELD_PENDING_COMPRAS_STAGE_LABEL[source as FieldPendingComprasStageSource] ?? null
  );
}

/** Shared, client-safe presentation filters: the screen and exports use identical matching. */
export type PendingViewFilters = { search?: string; overdue?: string; sort?: string };
type PendingViewItem = {
  title: string; projectCode: string; projectName: string; description: string | null;
  requestedByName: string | null; actionLabel: string; statusLabel: string;
  overdueDays: number; occurredAt: Date | string;
};

function normalizeSearch(value: string): string {
  return value.trim().toLocaleLowerCase("es-AR").normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

export function filterPendingView<T extends PendingViewItem>(items: T[], filters: PendingViewFilters): T[] {
  const search = normalizeSearch(filters.search ?? "");
  const result = items.filter((item) =>
    (filters.overdue !== "1" || item.overdueDays > 0) &&
    (!search || normalizeSearch([item.title, item.projectCode, item.projectName, item.description,
      item.requestedByName, item.actionLabel, item.statusLabel].filter(Boolean).join(" ")).includes(search)),
  );
  if (filters.sort === "oldest" || filters.sort === "newest") {
    const direction = filters.sort === "oldest" ? 1 : -1;
    result.sort((a, b) => direction * (new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime()));
  }
  return result;
}
