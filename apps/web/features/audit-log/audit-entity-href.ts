import { buildFinancialHref } from "@bloqer/services";

type EntityHrefOptions = {
  projectId?: string | null;
};

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
      return buildFinancialHref(
        entityType as Parameters<typeof buildFinancialHref>[0],
        entityId,
        { projectId },
      );
    case "Tenant":
    case "UserMembership":
    case "TenantInvitation":
    case "Company":
      return "/configuracion";
    default:
      return null;
  }
}
