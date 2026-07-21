import type { ReceivableStatus } from "@bloqer/database";

export type ReceivableListItem = {
  id: string;
  /** Null = corporate AR (D-051). */
  projectId: string | null;
  salesInvoiceId: string;
  dueDate: Date;
  status: ReceivableStatus;
  originalAmount: string;
  paidAmount: string;
  balanceDue: string;
  currency: string;
  clientName: string;
  projectCode?: string;
  projectName?: string;
  salesInvoiceCode?: string | null;
};

export function receivableDetailHref(r: Pick<ReceivableListItem, "id" | "projectId">): string {
  if (r.projectId) {
    return `/proyectos/${r.projectId}/cuentas-por-cobrar/${r.id}`;
  }
  return `/finanzas/cuentas-por-cobrar/${r.id}`;
}

export function receivableInvoiceHref(
  r: Pick<ReceivableListItem, "projectId" | "salesInvoiceId">,
): string | null {
  if (r.projectId) {
    return `/proyectos/${r.projectId}/facturas/${r.salesInvoiceId}`;
  }
  return null;
}
