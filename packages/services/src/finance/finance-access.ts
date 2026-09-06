import { can, hasCompanyFinanceRole } from "@bloqer/domain";
import type { ServiceContext } from "../types";
import { canViewTreasury as canViewTreasuryCapability } from "../security/access";

/**
 * Company finance tools (hub `/finanzas`, corporate AR/AP lists) — D-056 / D-111.
 * Requires a company-finance role AND at least one finance module VIEW.
 * Treasury is gated separately via `canViewCompanyTreasury`.
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

/**
 * Company treasury (caja / saldos / bancos / movimientos).
 * Authority = VIEW TREASURY (matrix). VIEWER preset no longer includes TREASURY ([D-111]).
 */
export function canViewCompanyTreasury(roles: ServiceContext["roles"]): boolean {
  return canViewTreasuryCapability(roles);
}

export { canViewTreasuryCapability as canViewTreasury };
