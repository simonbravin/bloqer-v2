import { can, hasCompanyFinanceRole } from "@bloqer/domain";
import type { ServiceContext } from "../types";

/** Aligns reads with `document.service` for SUPPLIER_INVOICE (VIEW AP | VIEW PROJECTS). */
export function canViewApProjectArea(roles: ServiceContext["roles"]): boolean {
  return can(roles, "VIEW", "AP") || can(roles, "VIEW", "PROJECTS");
}

/**
 * Company-level Finanzas AP routes — D-056: company-finance roles only
 * (not PROCUREMENT/PM alone via VIEW AP).
 */
export function canViewCompanyAp(roles: ServiceContext["roles"]): boolean {
  return hasCompanyFinanceRole(roles) && can(roles, "VIEW", "AP");
}
