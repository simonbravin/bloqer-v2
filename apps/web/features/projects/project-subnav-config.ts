import { can, type UserRole } from "@bloqer/domain";
import type { TenantModuleGate } from "@bloqer/services";
import {
  canShowProjectFinanzasNavLink,
  canViewApProjectArea,
  canViewArProjectArea,
  canViewProcurementProjectArea,
  canViewProjectCashFlowReport,
  canViewProjectCostControlReport,
} from "@bloqer/services";

export type ProjectSubnavLink = { label: string; href: string };

/**
 * Links for {@link ProjectSubnav}. Only **existing** App Router paths under `/proyectos/[id]`.
 *
 * **Not shown until routes exist** (documented in `FINANCE_AND_PROJECT_OVERVIEW_ARCHITECTURE.md`):
 * - `/proyectos/[id]/cronograma`
 * - `/proyectos/[id]/reportes`
 * - Dedicated WBS (today WBS lives inside presupuesto / control de costos)
 *
 * **Finanzas del proyecto:** `/proyectos/[id]/finanzas` (Phase 14E) cuando `canShowProjectFinanzasNavLink` da verdadero.
 */
export function buildProjectSubnavLinks(projectId: string, gate: TenantModuleGate, roles: UserRole[]): ProjectSubnavLink[] {
  const base = `/proyectos/${projectId}`;
  const out: ProjectSubnavLink[] = [];

  if (can(roles, "VIEW", "PROJECTS")) {
    out.push({ label: "Resumen", href: base });
  }

  if (canShowProjectFinanzasNavLink(gate, roles)) {
    out.push({ label: "Finanzas", href: `${base}/finanzas` });
  }

  const canBudgetsArea = can(roles, "VIEW", "BUDGETS") || can(roles, "VIEW", "PROJECTS");
  if (gate.isEnabled("BUDGETS") && canBudgetsArea) {
    out.push({ label: "Presupuesto", href: `${base}/presupuestos` });
  }

  if (
    gate.isEnabled("PROJECTS") &&
    gate.isEnabled("BUDGETS") &&
    canViewProjectCostControlReport(roles)
  ) {
    out.push({ label: "Control de costos", href: `${base}/control-costos` });
  }

  if (gate.isEnabled("JOBSITE_LOG") && (can(roles, "VIEW", "JOBSITE_LOG") || can(roles, "VIEW", "PROJECTS"))) {
    out.push({ label: "Libro de obra", href: `${base}/libro-obra` });
  }

  if (gate.isEnabled("CERTIFICATIONS") && can(roles, "VIEW", "CERTIFICATIONS")) {
    out.push({ label: "Certificaciones", href: `${base}/certificaciones` });
  }

  if (gate.isEnabled("PROCUREMENT") && canViewProcurementProjectArea(roles)) {
    out.push({ label: "Compras", href: `${base}/ordenes-compra` });
  }

  if (
    gate.isEnabled("SUBCONTRACTS") &&
    (can(roles, "VIEW", "SUBCONTRACTS") || can(roles, "VIEW", "PROJECTS"))
  ) {
    out.push({ label: "Subcontratos", href: `${base}/subcontratos` });
  }

  if (gate.isEnabled("INVENTORY") && can(roles, "VIEW", "INVENTORY")) {
    out.push({ label: "Inventario", href: `${base}/inventario` });
  }

  if (gate.isEnabled("PROJECTS") && can(roles, "VIEW", "PROJECTS")) {
    out.push({ label: "Documentos", href: `${base}/documentos` });
  }

  if (gate.isEnabled("AR") && canViewArProjectArea(roles)) {
    out.push({ label: "Facturas", href: `${base}/facturas` });
    out.push({ label: "Cuentas por cobrar", href: `${base}/cuentas-por-cobrar` });
    out.push({ label: "Cobranzas", href: `${base}/cobranzas` });
  }

  if (gate.isEnabled("AP") && canViewApProjectArea(roles)) {
    out.push({ label: "Facturas proveedor", href: `${base}/facturas-proveedor` });
    out.push({ label: "Cuentas por pagar", href: `${base}/cuentas-por-pagar` });
    out.push({ label: "Pagos", href: `${base}/pagos` });
  }

  if (gate.isEnabled("PROJECTS") && canViewProjectCashFlowReport(roles)) {
    out.push({ label: "Flujo de caja", href: `${base}/flujo-caja` });
  }

  if (gate.isEnabled("PROJECTS") && can(roles, "EDIT", "PROJECTS")) {
    out.push({ label: "Configuración", href: `${base}/editar` });
  }

  return out;
}
