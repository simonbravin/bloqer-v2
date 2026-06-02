import { can } from "@bloqer/domain";
import type { ServiceContext } from "../types";

/** Aligns reads with `document.service` listEntityDocuments for PO / PURCHASE_RECEIPT (VIEW PROCUREMENT | VIEW PROJECTS). */
export function canViewProcurementProjectArea(roles: ServiceContext["roles"]): boolean {
  return can(roles, "VIEW", "PROCUREMENT") || can(roles, "VIEW", "PROJECTS");
}

export function canEditPurchaseOrders(roles: ServiceContext["roles"]): boolean {
  return can(roles, "EDIT", "PURCHASE_ORDERS") || can(roles, "EDIT", "PROCUREMENT");
}

export function canApprovePurchaseOrders(roles: ServiceContext["roles"]): boolean {
  return can(roles, "APPROVE", "PURCHASE_ORDERS") || can(roles, "APPROVE", "PROCUREMENT");
}

export function canEditPurchaseRequests(roles: ServiceContext["roles"]): boolean {
  return can(roles, "EDIT", "PURCHASE_REQUESTS") || can(roles, "EDIT", "PROCUREMENT");
}

export function canEditPurchaseReceipts(roles: ServiceContext["roles"]): boolean {
  return (
    can(roles, "EDIT", "PURCHASE_ORDERS") ||
    can(roles, "EDIT", "PROCUREMENT") ||
    can(roles, "EDIT", "INVENTORY")
  );
}

export function canBypassDirectPoPolicy(roles: ServiceContext["roles"]): boolean {
  return roles.some((r) => r === "OWNER" || r === "ADMIN" || r === "PROCUREMENT");
}
