import { can, hasCompanyFinanceRole } from "@bloqer/domain";
import type { ServiceContext } from "../types";

/**
 * Company finance tools (hub `/finanzas`, corporate AR/AP lists) — D-056.
 * Requires a company-finance role AND at least one finance module VIEW.
 */
export function canViewCompanyFinanceHub(roles: ServiceContext["roles"]): boolean {
  if (!hasCompanyFinanceRole(roles)) return false;
  return (
    can(roles, "VIEW", "AR")
    || can(roles, "VIEW", "AP")
    || can(roles, "VIEW", "TREASURY")
    || can(roles, "VIEW", "ACCOUNTING")
  );
}

/** Company treasury (caja / saldos) — OWNER|ADMIN|FINANCE|TREASURER|VIEWER (D-056). */
export function canViewCompanyTreasury(roles: ServiceContext["roles"]): boolean {
  return hasCompanyFinanceRole(roles) && can(roles, "VIEW", "TREASURY");
}
