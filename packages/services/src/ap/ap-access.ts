import { can } from "@bloqer/domain";
import type { ServiceContext } from "../types";

/** Aligns reads with `document.service` for SUPPLIER_INVOICE (VIEW AP | VIEW PROJECTS). */
export function canViewApProjectArea(roles: ServiceContext["roles"]): boolean {
  return can(roles, "VIEW", "AP") || can(roles, "VIEW", "PROJECTS");
}
