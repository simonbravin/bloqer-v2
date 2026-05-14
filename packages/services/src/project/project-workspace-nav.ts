import { can, type UserRole } from "@bloqer/domain";
import { canViewApProjectArea } from "../ap/ap-access";
import { canViewArProjectArea } from "../ar/ar-access";
import { canShowProjectFinanzasNavLink, canViewProjectCashFlowReport, canViewProjectCostControlReport } from "./project-nav-guards";
import { canViewProcurementProjectArea } from "../procurement/procurement-access";
import type { TenantModuleGate } from "../tenant-modules/tenant-module-gate";

export type ProjectWorkspaceNavLink = { label: string; href: string; matchExact?: boolean };

export type ProjectWorkspaceNavSection = { title: string; items: ProjectWorkspaceNavLink[] };

/**
 * Grouped project workspace nav. Same gates and helpers as the former flat horizontal subnav (Phase 14D);
 * only **existing** App Router paths under `/proyectos/[id]`.
 */
export function buildProjectWorkspaceNavSections(
  projectId: string,
  gate: TenantModuleGate,
  roles: UserRole[],
): ProjectWorkspaceNavSection[] {
  const base = `/proyectos/${projectId}`;
  const sections: ProjectWorkspaceNavSection[] = [];

  const resumen: ProjectWorkspaceNavLink[] = [];
  if (can(roles, "VIEW", "PROJECTS")) {
    resumen.push({ label: "Resumen", href: base, matchExact: true });
  }
  if (resumen.length) sections.push({ title: "Resumen", items: resumen });

  const planificacion: ProjectWorkspaceNavLink[] = [];
  const canBudgetsArea = can(roles, "VIEW", "BUDGETS") || can(roles, "VIEW", "PROJECTS");
  if (gate.isEnabled("BUDGETS") && canBudgetsArea) {
    planificacion.push({ label: "Presupuesto", href: `${base}/presupuestos` });
  }
  if (gate.isEnabled("PROJECTS") && can(roles, "VIEW", "PROJECTS")) {
    planificacion.push({ label: "Cronograma", href: `${base}/cronograma` });
  }
  if (gate.isEnabled("PROJECTS") && gate.isEnabled("BUDGETS") && canViewProjectCostControlReport(roles)) {
    planificacion.push({ label: "WBS y costos", href: `${base}/control-costos` });
  }
  if (gate.isEnabled("PROJECTS") && canViewProjectCashFlowReport(roles)) {
    planificacion.push({ label: "Flujo de caja", href: `${base}/flujo-caja` });
  }
  if (canShowProjectFinanzasNavLink(gate, roles)) {
    planificacion.push({ label: "Finanzas del proyecto", href: `${base}/finanzas` });
  }
  if (planificacion.length) sections.push({ title: "Planificación", items: planificacion });

  const operacion: ProjectWorkspaceNavLink[] = [];
  if (gate.isEnabled("JOBSITE_LOG") && (can(roles, "VIEW", "JOBSITE_LOG") || can(roles, "VIEW", "PROJECTS"))) {
    operacion.push({ label: "Libro de obra", href: `${base}/libro-obra` });
  }
  if (gate.isEnabled("CERTIFICATIONS") && can(roles, "VIEW", "CERTIFICATIONS")) {
    operacion.push({ label: "Certificaciones", href: `${base}/certificaciones` });
  }
  if (gate.isEnabled("INVENTORY") && can(roles, "VIEW", "INVENTORY")) {
    operacion.push({ label: "Inventario", href: `${base}/inventario` });
  }
  if (gate.isEnabled("PROJECTS") && can(roles, "VIEW", "PROJECTS")) {
    operacion.push({ label: "Documentos", href: `${base}/documentos` });
  }
  if (operacion.length) sections.push({ title: "Operación", items: operacion });

  const compras: ProjectWorkspaceNavLink[] = [];
  if (gate.isEnabled("PROCUREMENT") && canViewProcurementProjectArea(roles)) {
    compras.push({ label: "Compras", href: `${base}/ordenes-compra` });
  }
  if (gate.isEnabled("SUBCONTRACTS") && (can(roles, "VIEW", "SUBCONTRACTS") || can(roles, "VIEW", "PROJECTS"))) {
    compras.push({ label: "Subcontratos", href: `${base}/subcontratos` });
  }
  if (gate.isEnabled("AP") && canViewApProjectArea(roles)) {
    compras.push({ label: "Facturas proveedor", href: `${base}/facturas-proveedor` });
    compras.push({ label: "Cuentas por pagar", href: `${base}/cuentas-por-pagar` });
    compras.push({ label: "Pagos", href: `${base}/pagos` });
  }
  if (compras.length) sections.push({ title: "Compras y contratos", items: compras });

  const comercial: ProjectWorkspaceNavLink[] = [];
  if (gate.isEnabled("AR") && canViewArProjectArea(roles)) {
    comercial.push({ label: "Facturas", href: `${base}/facturas` });
    comercial.push({ label: "Cuentas por cobrar", href: `${base}/cuentas-por-cobrar` });
    comercial.push({ label: "Cobranzas", href: `${base}/cobranzas` });
  }
  if (comercial.length) sections.push({ title: "Comercial / Cobranzas", items: comercial });

  const admin: ProjectWorkspaceNavLink[] = [];
  if (gate.isEnabled("PROJECTS") && can(roles, "EDIT", "PROJECTS")) {
    admin.push({ label: "Configuración", href: `${base}/editar` });
  }
  if (admin.length) sections.push({ title: "Administración", items: admin });

  return sections;
}
