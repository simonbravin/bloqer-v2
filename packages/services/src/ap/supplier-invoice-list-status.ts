import type { Prisma } from "@bloqer/database";

export type SupplierInvoiceListStatus = "DRAFT" | "ISSUED" | "CANCELLED";

/**
 * Default list: hide CANCELLED unless an exact status is set or includeCancelled.
 */
export function supplierInvoiceListStatusWhere(filters?: {
  status?: SupplierInvoiceListStatus;
  includeCancelled?: boolean;
}): Prisma.SupplierInvoiceWhereInput {
  if (filters?.status) return { status: filters.status };
  if (filters?.includeCancelled) return {};
  return { status: { not: "CANCELLED" } };
}
