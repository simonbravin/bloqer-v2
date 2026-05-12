import { can } from "@bloqer/domain";
import type { ServiceContext } from "../types";

/** Aligns reads with `document.service` listEntityDocuments for PO / PURCHASE_RECEIPT (VIEW PROCUREMENT | VIEW PROJECTS). */
export function canViewProcurementProjectArea(roles: ServiceContext["roles"]): boolean {
  return can(roles, "VIEW", "PROCUREMENT") || can(roles, "VIEW", "PROJECTS");
}
