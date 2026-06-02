import { can, type UserRole } from "@bloqer/domain";
import { canViewApProjectArea } from "../ap/ap-access";
import { canViewArProjectArea } from "../ar/ar-access";
import {
  canShowProjectFinanzasNavLink,
  canViewProjectCashFlowReport,
  canViewProjectCostControlReport,
  canViewProjectScheduleArea,
} from "./project-nav-guards";
import {
  canViewProcurementProjectArea,
  canViewPurchaseRequests,
} from "../procurement/procurement-access";
import type { TenantModuleGate } from "../tenant-modules/tenant-module-gate";

export type ProjectWorkspaceNavLink = {
  label: string;
  href: string;
  matchExact?: boolean;
  /** Highlight this item when pathname matches the prefix (e.g. pagos → facturas proveedor). */
  activeWhenPathPrefix?: string;
};

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
  if (gate.isEnabled("SCHEDULE") && canViewProjectScheduleArea(roles)) {
    planificacion.push({ label: "Cronograma", href: `${base}/cronograma` });
  }
  if (gate.isEnabled("PROJECTS") && gate.isEnabled("BUDGETS") && canViewProjectCostControlReport(roles)) {
    planificacion.push({ label: "WBS y costos", href: `${base}/control-costos` });
    planificacion.push({ label: "Reportes", href: `${base}/reportes` });
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

  const finanzasProyecto: ProjectWorkspaceNavLink[] = [];
  if (canShowProjectFinanzasNavLink(gate, roles)) {
    finanzasProyecto.push({ label: "Tablero de finanzas", href: `${base}/finanzas` });
  }
  if (gate.isEnabled("PROJECTS") && canViewProjectCashFlowReport(roles)) {
    finanzasProyecto.push({ label: "Flujo de caja", href: `${base}/flujo-caja` });
  }
  if (gate.isEnabled("PROCUREMENT") && canViewPurchaseRequests(roles)) {
    finanzasProyecto.push({ label: "Solicitudes de compra", href: `${base}/solicitudes-compra` });
  }
  if (gate.isEnabled("PROCUREMENT") && canViewProcurementProjectArea(roles)) {
    finanzasProyecto.push({ label: "Órdenes de compra", href: `${base}/ordenes-compra` });
  }
  if (gate.isEnabled("SUBCONTRACTS") && (can(roles, "VIEW", "SUBCONTRACTS") || can(roles, "VIEW", "PROJECTS"))) {
    finanzasProyecto.push({ label: "Subcontratos", href: `${base}/subcontratos` });
  }
  if (gate.isEnabled("AP") && canViewApProjectArea(roles)) {
    finanzasProyecto.push({ label: "Cuentas por pagar", href: `${base}/cuentas-por-pagar` });
  }
  if (gate.isEnabled("AR") && canViewArProjectArea(roles)) {
    finanzasProyecto.push({ label: "Cuentas por cobrar", href: `${base}/cuentas-por-cobrar` });
  }
  if (gate.isEnabled("AP") && canViewApProjectArea(roles)) {
    finanzasProyecto.push({
      label: "Facturas proveedor",
      href: `${base}/facturas-proveedor`,
      activeWhenPathPrefix: `${base}/pagos`,
    });
  }
  if (gate.isEnabled("AR") && canViewArProjectArea(roles)) {
    finanzasProyecto.push({
      label: "Facturas emitidas",
      href: `${base}/facturas`,
      activeWhenPathPrefix: `${base}/cobranzas`,
    });
  }
  if (finanzasProyecto.length) {
    sections.push({ title: "Finanzas del proyecto", items: finanzasProyecto });
  }

  const admin: ProjectWorkspaceNavLink[] = [];
  if (gate.isEnabled("PROJECTS") && can(roles, "EDIT", "PROJECTS")) {
    admin.push({ label: "Configuración", href: `${base}/editar` });
  }
  if (admin.length) sections.push({ title: "Administración", items: admin });

  return sections;
}
