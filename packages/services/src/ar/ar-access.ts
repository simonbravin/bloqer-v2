import { can } from "@bloqer/domain";
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
