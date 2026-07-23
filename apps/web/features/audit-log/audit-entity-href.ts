type EntityHrefOptions = {
  projectId?: string | null;
  accountId?: string;
};

type FinancialEntityType =
  | "SalesInvoice"
  | "Receivable"
  | "Collection"
  | "SupplierInvoice"
  | "Payable"
  | "Payment"
  | "AccountMovement";

function buildFinancialEntityHref(
  entityType: FinancialEntityType,
  entityId: string,
  options?: EntityHrefOptions,
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

export function buildAuditEntityHref(
  entityType: string,
  entityId: string,
  options?: EntityHrefOptions,
): string | null {
  const projectId = options?.projectId ?? undefined;

  switch (entityType) {
    case "Project":
      return `/proyectos/${entityId}`;
    case "PurchaseOrder":
      return projectId ? `/proyectos/${projectId}/ordenes-compra/${entityId}` : null;
    case "PurchaseRequest":
      return projectId ? `/proyectos/${projectId}/solicitudes-compra/${entityId}` : null;
    case "PurchaseReceipt":
      return projectId ? `/proyectos/${projectId}/ordenes-compra` : null;
    case "Budget":
      return projectId ? `/proyectos/${projectId}/presupuestos/${entityId}` : null;
    case "Certification":
      return projectId ? `/proyectos/${projectId}/certificaciones/${entityId}` : null;
    case "Subcontract":
      return projectId ? `/proyectos/${projectId}/subcontratos/${entityId}` : null;
    case "JobsiteLog":
      return projectId ? `/proyectos/${projectId}/libro-obra/${entityId}` : null;
    case "Schedule":
    case "ScheduleItem":
      return projectId ? `/proyectos/${projectId}/cronograma` : null;
    case "JournalEntry":
      return `/contabilidad/asientos/${entityId}`;
    case "SalesInvoice":
    case "Receivable":
    case "Collection":
    case "SupplierInvoice":
    case "Payable":
    case "Payment":
    case "AccountMovement":
      return buildFinancialEntityHref(entityType, entityId, { projectId, accountId: options?.accountId });
    case "Tenant":
    case "UserMembership":
    case "TenantInvitation":
    case "Company":
      return "/configuracion";
    default:
      return null;
  }
}
