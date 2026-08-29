import type { PermissionModule } from "@bloqer/domain";
import type { ScheduledReportKey } from "@bloqer/validators";

export type ScheduledReportScopeKind = "TENANT" | "PROJECT";
export type ScheduledReportCatalogGroup = "financial" | "operational";

export type ScheduledReportKeyMeta = {
  scope: ScheduledReportScopeKind;
  labelEs: string;
  group: ScheduledReportCatalogGroup;
  requiredModules: PermissionModule[];
  /** Hidden from the picker; kept so legacy schedules still run ([D-098]). */
  listed?: boolean;
};

export const SCHEDULED_REPORT_GROUP_LABEL_ES: Record<ScheduledReportCatalogGroup, string> = {
  financial: "Financieros",
  operational: "Operativos",
};

export const SCHEDULED_REPORT_KEY_META: Record<ScheduledReportKey, ScheduledReportKeyMeta> = {
  TENANT_AR_AGING: {
    scope: "TENANT",
    labelEs: "Aging CxC",
    group: "financial",
    requiredModules: ["AR"],
  },
  TENANT_AP_AGING: {
    scope: "TENANT",
    labelEs: "Aging CxP",
    group: "financial",
    requiredModules: ["AP"],
  },
  TENANT_TREASURY_CASH_POSITION: {
    scope: "TENANT",
    labelEs: "Tesorería — Posición de caja",
    group: "financial",
    requiredModules: ["TREASURY"],
  },
  TENANT_TREASURY_MOVEMENTS: {
    scope: "TENANT",
    labelEs: "Tesorería — Movimientos",
    group: "financial",
    requiredModules: ["TREASURY"],
  },
  TENANT_TREASURY_CASH_FLOW: {
    scope: "TENANT",
    labelEs: "Flujo de caja consolidado",
    group: "financial",
    requiredModules: ["TREASURY"],
  },
  TENANT_INVENTORY_STOCK: {
    scope: "TENANT",
    labelEs: "Inventario — Stock",
    group: "operational",
    requiredModules: ["INVENTORY"],
  },
  TENANT_INVENTORY_MOVEMENTS: {
    scope: "TENANT",
    labelEs: "Inventario — Movimientos",
    group: "operational",
    requiredModules: ["INVENTORY"],
  },
  TENANT_CORPORATE_PAYABLES: {
    scope: "TENANT",
    labelEs: "CxP corporativo",
    group: "financial",
    requiredModules: ["AP"],
  },
  TENANT_CORPORATE_SUPPLIER_INVOICES: {
    scope: "TENANT",
    labelEs: "Facturas proveedor corporativas",
    group: "financial",
    requiredModules: ["AP"],
  },
  TENANT_PROJECT_PORTFOLIO: {
    scope: "TENANT",
    labelEs: "Portafolio de proyectos",
    group: "operational",
    requiredModules: ["PROJECTS"],
  },
  TENANT_MULTI_PROJECT_RENTABILITY: {
    scope: "TENANT",
    labelEs: "Rentabilidad multi-obra",
    group: "financial",
    requiredModules: ["PROJECTS"],
  },
  TENANT_OVERHEAD_BY_PROJECT: {
    scope: "TENANT",
    labelEs: "Gastos generales por proyecto",
    group: "financial",
    requiredModules: ["AP"],
  },
  TENANT_MULTI_PROJECT_PROCUREMENT: {
    scope: "TENANT",
    labelEs: "Compras multi-obra",
    group: "operational",
    requiredModules: ["PROCUREMENT"],
  },
  TENANT_JOBSITE_DAILY_LOGS: {
    scope: "TENANT",
    labelEs: "Libro de obra — parte del día",
    group: "operational",
    requiredModules: ["PROJECTS", "JOBSITE_LOG"],
  },
  PROJECT_COST_CONTROL: {
    scope: "PROJECT",
    labelEs: "EDT y costos",
    group: "operational",
    requiredModules: ["PROJECTS", "BUDGETS"],
  },
  PROJECT_CASH_FLOW: {
    scope: "PROJECT",
    labelEs: "Caja y proyección",
    group: "financial",
    requiredModules: ["PROJECTS"],
  },
  PROJECT_BUDGET_VARIANCE: {
    scope: "PROJECT",
    labelEs: "Presupuesto vs real (legado)",
    group: "operational",
    requiredModules: ["BUDGETS"],
    listed: false,
  },
  PROJECT_CERTIFICATIONS: {
    scope: "PROJECT",
    labelEs: "Certificaciones",
    group: "operational",
    requiredModules: ["CERTIFICATIONS"],
  },
  PROJECT_PROCUREMENT: {
    scope: "PROJECT",
    labelEs: "Análisis de compras",
    group: "operational",
    requiredModules: ["PROCUREMENT"],
  },
  PROJECT_SUBCONTRACTS: {
    scope: "PROJECT",
    labelEs: "Subcontratos",
    group: "operational",
    requiredModules: ["SUBCONTRACTS"],
  },
  PROJECT_MATERIALS: {
    scope: "PROJECT",
    labelEs: "Materiales",
    group: "operational",
    requiredModules: ["PROJECTS", "BUDGETS"],
  },
  PROJECT_INCOME_EXPENSE: {
    scope: "PROJECT",
    labelEs: "Ingresos vs gastos",
    group: "financial",
    requiredModules: ["PROJECTS"],
  },
  PROJECT_PROFITABILITY: {
    scope: "PROJECT",
    labelEs: "Rentabilidad",
    group: "financial",
    requiredModules: ["PROJECTS"],
  },
};

export function listReportKeysForScope(
  scope: ScheduledReportScopeKind,
  options?: { includeHidden?: boolean },
): ScheduledReportKey[] {
  return (Object.keys(SCHEDULED_REPORT_KEY_META) as ScheduledReportKey[]).filter((k) => {
    const meta = SCHEDULED_REPORT_KEY_META[k];
    if (meta.scope !== scope) return false;
    if (!options?.includeHidden && meta.listed === false) return false;
    return true;
  });
}

export function isReportKeyAllowedForScope(
  reportKey: ScheduledReportKey,
  scope: ScheduledReportScopeKind,
): boolean {
  return SCHEDULED_REPORT_KEY_META[reportKey]?.scope === scope;
}
