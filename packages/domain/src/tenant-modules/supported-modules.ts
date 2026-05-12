import type { PermissionModule } from "../permissions/matrix";
import { OVERVIEW_MODULES } from "../permissions/matrix-overview";

/** Spanish labels for platform tenant module UI (Phase 12B). */
export const TENANT_MODULE_LABEL_ES: Record<PermissionModule, string> = {
  DIRECTORY:                     "Directorio",
  CLIENTS:                       "Clientes",
  SUPPLIERS:                     "Proveedores",
  SUBCONTRACTORS:                "Subcontratistas",
  PROJECTS:                      "Proyectos",
  SCHEDULE:                      "Cronograma",
  BUDGETS:                       "Presupuestos",
  WBS:                           "WBS / Cómputos",
  CONTRACTS:                     "Contratos / Adendas",
  CHANGE_ORDERS:                 "Change orders",
  RFIS:                          "RFIs",
  JOBSITE_LOG:                   "Libro de obra",
  CERTIFICATIONS:                "Certificaciones",
  PROCUREMENT:                   "Compras",
  PURCHASE_ORDERS:               "Órdenes de compra",
  SUBCONTRACTS:                  "Subcontratos",
  INVENTORY:                     "Inventario",
  WAREHOUSES:                    "Depósitos",
  DOCUMENTS:                     "Documentos",
  NOTIFICATIONS:                 "Notificaciones",
  TREASURY:                      "Tesorería",
  BANK_ACCOUNTS:                 "Cuentas bancarias",
  BANK_RECONCILIATION:           "Conciliación bancaria",
  EXPENSES_PAYMENTS:             "Gastos / Pagos",
  INTERNAL_TRANSFERS:          "Transferencias internas",
  AR:                            "CxC / Ventas",
  AP:                            "CxP / Compras AP",
  TAXES:                         "Impuestos / Retenciones",
  PERIOD_CLOSE:                  "Cierre de periodo",
  ACCOUNTING:                    "Contabilidad",
  USERS_PERMISSIONS:             "Usuarios y permisos",
  TENANT_SETTINGS:               "Configuración del tenant",
  MASTER_DATA:                   "Master data / Catálogos",
  AUDIT:                         "Auditoría",
  BILLING:                       "Facturación SaaS",
  TENANT_TRANSFER:               "Transferencia de tenant",
  CONSOLIDATED_NET_PROFITABILITY: "Rentabilidad neta consolidada",
};

/** Keys aligned with `OVERVIEW_MODULES` / `PermissionModule` (single source for toggles). */
export function listSupportedTenantModules(): ReadonlyArray<{
  moduleKey: PermissionModule;
  label:     string;
}> {
  return OVERVIEW_MODULES.map((moduleKey) => ({
    moduleKey,
    label: TENANT_MODULE_LABEL_ES[moduleKey],
  }));
}
