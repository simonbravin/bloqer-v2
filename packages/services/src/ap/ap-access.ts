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

/** Company-level Finanzas AP mutations (corporate SupplierInvoice / Payable / Payment) — D-056. */
export function canEditCompanyAp(roles: ServiceContext["roles"]): boolean {
  return hasCompanyFinanceRole(roles) && can(roles, "EDIT", "AP");
}

/**
 * Mutación AP según scope: corporativo (`projectId` null) exige company-finance;
 * proyecto exige techo `EDIT AP` (D-056).
 */
export function canMutateApForScope(
  roles: ServiceContext["roles"],
  projectId: string | null,
): boolean {
  return projectId === null ? canEditCompanyAp(roles) : can(roles, "EDIT", "AP");
}
