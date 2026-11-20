import { PurchaseOrderStatus, PurchaseRequestStatus } from "@bloqer/database";
import { ServiceError } from "../types";

export type PurchaseRequestSearch = {
  status?: string;
  limit?: number;
};

export type PurchaseOrderSearch = PurchaseRequestSearch & {
  pendingApproval?: boolean;
  pendingReceipt?: boolean;
};

/** Bound the database read, including callers outside the AI tool schema. */
export function procurementSearchLimit(limit: number | undefined): number {
  const value = limit ?? 20;
  if (!Number.isInteger(value) || value < 1 || value > 30) {
    throw new ServiceError("VALIDATION", "El límite de resultados debe estar entre 1 y 30.");
  }
  return value;
}

/** Unknown status strings retain the existing empty-result search behavior. */
export function purchaseRequestSearchStatuses(status: string | undefined): PurchaseRequestStatus[] | undefined {
  if (!status) return undefined;
  return Object.values(PurchaseRequestStatus).filter((candidate) => candidate === status);
}

/** Status and pending filters intersect; incompatible combinations return no rows. */
export function purchaseOrderSearchStatuses(search: PurchaseOrderSearch): PurchaseOrderStatus[] | undefined {
  if (!search.status && !search.pendingApproval && !search.pendingReceipt) return undefined;
  return Object.values(PurchaseOrderStatus).filter((status) =>
    (!search.status || status === search.status) &&
    (!search.pendingApproval || status === "SUBMITTED") &&
    (!search.pendingReceipt || status === "CONFIRMED" || status === "PARTIALLY_RECEIVED"),
  );
}
