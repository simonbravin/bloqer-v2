import type { FinancialTraceEntityType } from "./register-transaction.types";

export type FinancialHrefOptions = {
  projectId?: string | null;
  accountId?: string;
  /** Corporate AR: deep-link SalesInvoice / Collection to receivable detail when known. */
  receivableId?: string;
};

export function buildFinancialHref(
  entityType: FinancialTraceEntityType,
  entityId: string,
  options?: FinancialHrefOptions,
): string {
  const projectId = options?.projectId ?? undefined;
  if (projectId) {
    switch (entityType) {
      case "SalesInvoice":
        return `/proyectos/${projectId}/facturas/${entityId}`;
      case "Receivable":
        return `/proyectos/${projectId}/cuentas-por-cobrar/${entityId}`;
      case "Collection":
        return `/proyectos/${projectId}/cobranzas/${entityId}`;
      case "SupplierInvoice":
        return `/proyectos/${projectId}/facturas-proveedor/${entityId}`;
      case "Payable":
        return `/proyectos/${projectId}/cuentas-por-pagar/${entityId}`;
      case "Payment":
        return `/proyectos/${projectId}/pagos/${entityId}`;
      case "AccountMovement": {
        const accountId = options?.accountId;
        return accountId
          ? `/tesoreria/movimientos?accountId=${encodeURIComponent(accountId)}`
          : "/tesoreria/movimientos";
      }
      default:
        return "/finanzas/transacciones";
    }
  }

  switch (entityType) {
    case "SupplierInvoice":
      return `/finanzas/facturas-proveedor/${entityId}`;
    case "Payable":
      return `/finanzas/cuentas-por-pagar/${entityId}`;
    case "Payment":
      return `/finanzas/pagos-proveedor/${entityId}`;
    case "SalesInvoice":
      return options?.receivableId
        ? `/finanzas/cuentas-por-cobrar/${options.receivableId}`
        : `/finanzas/cuentas-por-cobrar`;
    case "Receivable":
      return `/finanzas/cuentas-por-cobrar/${entityId}`;
    case "Collection":
      return options?.receivableId
        ? `/finanzas/cuentas-por-cobrar/${options.receivableId}`
        : `/finanzas/cuentas-por-cobrar`;
    case "AccountMovement": {
      const accountId = options?.accountId;
      return accountId
        ? `/tesoreria/movimientos?accountId=${encodeURIComponent(accountId)}`
        : "/tesoreria/movimientos";
    }
    default:
      return "/finanzas/transacciones";
  }
}
