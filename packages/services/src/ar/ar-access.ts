import { can, hasCompanyFinanceRole } from "@bloqer/domain";
import type { ServiceContext } from "../types";

/**
 * Lecturas AR en contexto de proyecto (facturas, CXC, cobranzas list/detail).
 * Alineado con adjuntos y con AP project reads (`VIEW AP | VIEW PROJECTS`).
 */
export function canViewArProjectArea(roles: ServiceContext["roles"]): boolean {
  return can(roles, "VIEW", "AR") || can(roles, "VIEW", "PROJECTS");
}

/**
 * Mutaciones AR: facturas, cancelación de receivable, cobranzas.
 * No usar `EDIT PROJECTS` aquí (Phase 7B). El módulo legacy `SALES_COLLECTIONS` fue removido del dominio en Phase 7C.
 */
export function canEditArArea(roles: ServiceContext["roles"]): boolean {
  return can(roles, "EDIT", "AR");
}

/**
 * Company-level Finanzas AR routes — D-056: company-finance roles only
 * (not SALES/PM/PROJECT_FINANCE alone via VIEW AR).
 */
export function canViewCompanyAr(roles: ServiceContext["roles"]): boolean {
  return hasCompanyFinanceRole(roles) && can(roles, "VIEW", "AR");
}

/** Company-level Finanzas AR mutations (corporate SalesInvoice / Receivable) — D-051 + D-056. */
export function canEditCompanyAr(roles: ServiceContext["roles"]): boolean {
  return hasCompanyFinanceRole(roles) && can(roles, "EDIT", "AR");
}

/**
 * Mutación AR según scope: corporativo (`projectId` null) exige company-finance;
 * proyecto exige techo `EDIT AR` (D-056).
 */
export function canMutateArForScope(
  roles: ServiceContext["roles"],
  projectId: string | null,
): boolean {
  return projectId === null ? canEditCompanyAr(roles) : canEditArArea(roles);
}
