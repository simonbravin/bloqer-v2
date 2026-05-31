import type { PermissionModule } from "@bloqer/domain";
import type { ScheduledReportKey } from "@bloqer/validators";

export type ScheduledReportScopeKind = "TENANT" | "PROJECT";

export type ScheduledReportKeyMeta = {
  scope: ScheduledReportScopeKind;
  labelEs: string;
  requiredModules: PermissionModule[];
};

export const SCHEDULED_REPORT_KEY_META: Record<ScheduledReportKey, ScheduledReportKeyMeta> = {
  TENANT_AR_AGING: { scope: "TENANT", labelEs: "Cuentas por cobrar (aging)", requiredModules: ["AR"] },
  TENANT_AP_AGING: { scope: "TENANT", labelEs: "Cuentas por pagar (aging)", requiredModules: ["AP"] },
  TENANT_TREASURY_CASH_POSITION: {
    scope: "TENANT",
    labelEs: "Tesorería — Posición de caja",
    requiredModules: ["TREASURY"],
  },
  TENANT_TREASURY_MOVEMENTS: {
    scope: "TENANT",
    labelEs: "Tesorería — Movimientos",
    requiredModules: ["TREASURY"],
  },
  TENANT_TREASURY_CASH_FLOW: {
    scope: "TENANT",
    labelEs: "Tesorería — Flujo de caja",
    requiredModules: ["TREASURY"],
  },
  TENANT_INVENTORY_STOCK: { scope: "TENANT", labelEs: "Inventario — Stock", requiredModules: ["INVENTORY"] },
  TENANT_INVENTORY_MOVEMENTS: {
    scope: "TENANT",
    labelEs: "Inventario — Movimientos",
    requiredModules: ["INVENTORY"],
  },
  TENANT_CORPORATE_PAYABLES: {
    scope: "TENANT",
    labelEs: "CXP corporativo",
    requiredModules: ["AP"],
  },
  TENANT_CORPORATE_SUPPLIER_INVOICES: {
    scope: "TENANT",
    labelEs: "Facturas proveedor corporativas",
    requiredModules: ["AP"],
  },
  PROJECT_COST_CONTROL: {
    scope: "PROJECT",
    labelEs: "Control de costos",
    requiredModules: ["PROJECTS", "BUDGETS"],
  },
  PROJECT_CASH_FLOW: { scope: "PROJECT", labelEs: "Flujo de caja del proyecto", requiredModules: ["PROJECTS"] },
  PROJECT_BUDGET_VARIANCE: {
    scope: "PROJECT",
    labelEs: "Presupuesto vs real",
    requiredModules: ["BUDGETS"],
  },
  PROJECT_CERTIFICATIONS: {
    scope: "PROJECT",
    labelEs: "Certificaciones",
    requiredModules: ["CERTIFICATIONS"],
  },
  PROJECT_PROCUREMENT: {
    scope: "PROJECT",
    labelEs: "Compras y proveedores",
    requiredModules: ["PROCUREMENT"],
  },
  PROJECT_SUBCONTRACTS: { scope: "PROJECT", labelEs: "Subcontratos", requiredModules: ["SUBCONTRACTS"] },
  PROJECT_MATERIALS: { scope: "PROJECT", labelEs: "Materiales", requiredModules: ["INVENTORY"] },
  PROJECT_INCOME_EXPENSE: {
    scope: "PROJECT",
    labelEs: "Ingresos vs gastos",
    requiredModules: ["PROJECTS"],
  },
  PROJECT_PROFITABILITY: { scope: "PROJECT", labelEs: "Rentabilidad", requiredModules: ["PROJECTS"] },
};

export function listReportKeysForScope(scope: ScheduledReportScopeKind): ScheduledReportKey[] {
  return (Object.keys(SCHEDULED_REPORT_KEY_META) as ScheduledReportKey[]).filter(
    (k) => SCHEDULED_REPORT_KEY_META[k].scope === scope,
  );
}

export function isReportKeyAllowedForScope(
  reportKey: ScheduledReportKey,
  scope: ScheduledReportScopeKind,
): boolean {
  return SCHEDULED_REPORT_KEY_META[reportKey]?.scope === scope;
}
