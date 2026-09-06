import { can } from "@bloqer/domain";
import type { ServiceContext } from "../types";

/**
 * Procurement project-area reads ([D-111] G1-C).
 * Explicit PROCUREMENT / PURCHASE_* only — VIEW PROJECTS alone is NOT enough
 * (documents use canViewProjectDocuments / VIEW PROJECTS separately).
 */
export function canViewProcurementProjectArea(roles: ServiceContext["roles"]): boolean {
  return (
    can(roles, "VIEW", "PROCUREMENT") ||
    can(roles, "VIEW", "PURCHASE_ORDERS")
  );
}

/** List/detail purchase requests. */
export function canViewPurchaseRequests(roles: ServiceContext["roles"]): boolean {
  return can(roles, "VIEW", "PURCHASE_REQUESTS") || canViewProcurementProjectArea(roles);
}

/** Load quotes, select supplier, create draft PO from a request. */
export function canManageProcurementQuotes(roles: ServiceContext["roles"]): boolean {
  return canEditPurchaseOrders(roles);
}

export function canEditPurchaseOrders(roles: ServiceContext["roles"]): boolean {
  return (
    can(roles, "EDIT", "PROCUREMENT") ||
    can(roles, "APPROVE", "PURCHASE_ORDERS") ||
    can(roles, "APPROVE", "PROCUREMENT")
  );
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
