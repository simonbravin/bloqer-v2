import { can, type UserRole } from "@bloqer/domain";
import { canViewApProjectArea } from "../ap/ap-access";
import { canViewArProjectArea } from "../ar/ar-access";
import type { TenantModuleGate } from "../tenant-modules/tenant-module-gate";

/** Matches document.service listEntityDocuments for `BUDGET` — VIEW BUDGETS | VIEW PROJECTS. */
export function canViewBudgetsArea(roles: UserRole[]): boolean {
  return can(roles, "VIEW", "BUDGETS") || can(roles, "VIEW", "PROJECTS");
}

/** Project-scoped cost control (Phase 7D): VIEW PROJECTS or VIEW BUDGETS. */
export function canViewProjectCostControlReport(roles: UserRole[]): boolean {
  return can(roles, "VIEW", "PROJECTS") || can(roles, "VIEW", "BUDGETS");
}

/** Project-scoped schedule / cronograma: VIEW SCHEDULE or VIEW PROJECTS. */
export function canViewProjectScheduleArea(roles: UserRole[]): boolean {
  return can(roles, "VIEW", "SCHEDULE") || can(roles, "VIEW", "PROJECTS");
}

/** Project-scoped cash flow report (Phase 7D): not tenant-wide treasury; allows finance roles without VIEW PROJECTS. */
export function canViewProjectCashFlowReport(roles: UserRole[]): boolean {
  return (
    can(roles, "VIEW", "PROJECTS") ||
    can(roles, "VIEW", "AR") ||
    can(roles, "VIEW", "AP") ||
    can(roles, "VIEW", "TREASURY")
  );
}

/**
 * Nav “Tablero de finanzas” (`/proyectos/[id]/finanzas`): módulo **PROJECTS** activo y al menos un bloque financiero/presupuesto visible.
 */
export function canShowProjectFinanzasNavLink(gate: TenantModuleGate, roles: UserRole[]): boolean {
  if (!gate.isEnabled("PROJECTS")) return false;
  const anyFinanceModule =
    gate.isEnabled("AR") ||
    gate.isEnabled("AP") ||
    gate.isEnabled("TREASURY") ||
    gate.isEnabled("BUDGETS") ||
    canViewProjectCashFlowReport(roles);
  if (!anyFinanceModule) return false;
  return (
    (gate.isEnabled("AR") && canViewArProjectArea(roles)) ||
    (gate.isEnabled("AP") && canViewApProjectArea(roles)) ||
    (gate.isEnabled("TREASURY") && can(roles, "VIEW", "TREASURY")) ||
    (gate.isEnabled("BUDGETS") && canViewBudgetsArea(roles)) ||
    canViewProjectCashFlowReport(roles)
  );
}
