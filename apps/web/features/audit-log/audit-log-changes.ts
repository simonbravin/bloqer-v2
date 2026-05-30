export type AuditChangeKind = "added" | "removed" | "changed";

export type AuditChangeItem = {
  kind: AuditChangeKind;
  field: string;
  label: string;
  before: string | null;
  after: string | null;
};

export type AuditChangesResult = {
  summary: string;
  items: AuditChangeItem[];
};

const FIELD_LABELS_ES: Record<string, string> = {
  status: "Estado",
  name: "Nombre",
  number: "Número",
  amount: "Monto",
  type: "Tipo",
  currency: "Moneda",
  issued: "Emitido",
  paid: "Pagado",
  projectId: "Proyecto",
  companyId: "Empresa",
  purchaseOrderId: "Orden de compra",
  supplierInvoiceId: "Factura de proveedor",
  payableId: "Cuenta por pagar",
  receivableId: "Cuenta a cobrar",
  productId: "Producto",
  warehouseId: "Depósito",
  quantity: "Cantidad",
  category: "Categoría",
  originalFileName: "Archivo",
  storageProvider: "Almacenamiento",
  sourceType: "Origen",
  budgetId: "Presupuesto",
  wbsNodeId: "Partida WBS",
  certificationId: "Certificación",
  contactId: "Contacto",
  email: "Correo",
  roles: "Roles",
  timezone: "Zona horaria",
  baseCurrency: "Moneda base",
};

const STATUS_VALUE_ES: Record<string, string> = {
  DRAFT: "Borrador",
  PENDING: "Pendiente",
  PENDING_APPROVAL: "Pendiente de aprobación",
  APPROVED: "Aprobado",
  ISSUED: "Emitido",
  CONFIRMED: "Confirmado",
  ACTIVE: "Activo",
  INACTIVE: "Inactivo",
  DEACTIVATED: "Desactivado",
  CANCELLED: "Anulado",
  CANCELED: "Anulado",
  CLOSED: "Cerrado",
  ARCHIVED: "Archivado",
  DELETED: "Eliminado",
  PAID: "Pagado",
  PARTIAL: "Parcial",
  OVERDUE: "Vencido",
  BLOCKED: "Bloqueado",
  COMPLETED: "Completado",
  REJECTED: "Rechazado",
  RETURNED: "Devuelto",
  SUBMITTED: "Enviado a revisión",
  TRIAL: "Prueba",
  SUSPENDED: "Suspendido",
};

const TYPE_VALUE_ES: Record<string, string> = {
  INFLOW: "Ingreso",
  OUTFLOW: "Egreso",
  MANUAL_ADJUSTMENT: "Ajuste manual",
  BANK: "Banco",
  CASH: "Caja",
  TASK: "Tarea",
  MILESTONE: "Hito",
};

function fieldLabel(field: string): string {
  return FIELD_LABELS_ES[field] ?? field.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (value == null) return null;
  if (typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return null;
}

function formatAuditValue(value: unknown, fieldKey: string): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") {
    if (fieldKey === "status") return STATUS_VALUE_ES[value] ?? value;
    if (fieldKey === "type") return TYPE_VALUE_ES[value] ?? value;
    return STATUS_VALUE_ES[value] ?? value;
  }
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function valuesEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function buildSummary(
  action: string | undefined,
  items: AuditChangeItem[],
  hadBefore: boolean,
  hadAfter: boolean,
): string {
  const statusChange = items.find((i) => i.field === "status" && i.kind === "changed");

  if (statusChange?.before && statusChange.after) {
    return `El estado cambió de «${statusChange.before}» a «${statusChange.after}».`;
  }

  if (items.length === 1 && items[0]!.kind === "changed") {
    const only = items[0]!;
    return `${only.label} cambió de «${only.before ?? "—"}» a «${only.after ?? "—"}».`;
  }

  if (!hadBefore && hadAfter && items.length > 0) {
    return "Se registraron estos datos al crear o confirmar la operación.";
  }

  if (items.length > 0) {
    return `Se modificaron ${items.length} dato${items.length === 1 ? "" : "s"} en este evento.`;
  }

  if (action?.includes("cancelled") || action?.includes("CANCELLED")) {
    return "Operación de anulación. No hay campos detallados en el registro.";
  }
  if (action?.includes("created") || action?.includes("CREATED")) {
    return "Operación de alta. No hay campos detallados en el registro.";
  }
  if (action?.includes("issued") || action?.includes("ISSUED")) {
    return "Operación de emisión. No hay campos detallados en el registro.";
  }
  if (action?.includes("confirmed") || action?.includes("CONFIRMED")) {
    return "Operación de confirmación. No hay campos detallados en el registro.";
  }

  return "No hay detalle de cambios registrado para esta acción.";
}

export function describeAuditChanges(
  before: unknown,
  after: unknown,
  action?: string,
): AuditChangesResult {
  const beforeRec = toRecord(before);
  const afterRec = toRecord(after);
  const items: AuditChangeItem[] = [];

  if (!beforeRec && afterRec) {
    for (const [field, val] of Object.entries(afterRec)) {
      items.push({
        kind: "added",
        field,
        label: fieldLabel(field),
        before: null,
        after: formatAuditValue(val, field),
      });
    }
  } else if (beforeRec && !afterRec) {
    for (const [field, val] of Object.entries(beforeRec)) {
      items.push({
        kind: "removed",
        field,
        label: fieldLabel(field),
        before: formatAuditValue(val, field),
        after: null,
      });
    }
  } else if (beforeRec && afterRec) {
    const allKeys = new Set([...Object.keys(beforeRec), ...Object.keys(afterRec)]);
    for (const field of allKeys) {
      const b = beforeRec[field];
      const a = afterRec[field];
      if (valuesEqual(b, a)) continue;

      if (!(field in beforeRec)) {
        items.push({
          kind: "added",
          field,
          label: fieldLabel(field),
          before: null,
          after: formatAuditValue(a, field),
        });
      } else if (!(field in afterRec)) {
        items.push({
          kind: "removed",
          field,
          label: fieldLabel(field),
          before: formatAuditValue(b, field),
          after: null,
        });
      } else {
        items.push({
          kind: "changed",
          field,
          label: fieldLabel(field),
          before: formatAuditValue(b, field),
          after: formatAuditValue(a, field),
        });
      }
    }
  }

  items.sort((x, y) => {
    if (x.field === "status") return -1;
    if (y.field === "status") return 1;
    return x.label.localeCompare(y.label, "es");
  });

  return {
    summary: buildSummary(action, items, Boolean(beforeRec), Boolean(afterRec)),
    items,
  };
}

export const ENTITY_TYPE_LABEL_ES: Record<string, string> = {
  PurchaseOrder: "Orden de compra",
  PurchaseReceipt: "Recepción de compra",
  SupplierInvoice: "Factura de proveedor",
  Payable: "Cuenta por pagar",
  Payment: "Pago",
  SalesInvoice: "Factura de venta",
  Receivable: "Cuenta por cobrar",
  Collection: "Cobranza",
  TreasuryAccount: "Cuenta de tesorería",
  AccountMovement: "Movimiento de caja",
  InternalTransfer: "Transferencia interna",
  Product: "Producto",
  Warehouse: "Depósito",
  StockMovement: "Movimiento de stock",
  Budget: "Presupuesto",
  Certification: "Certificación",
  Project: "Proyecto",
  Contact: "Contacto",
  Tenant: "Tenant",
  UserMembership: "Membresía",
  DocumentAttachment: "Documento",
};

export function entityTypeLabel(entityType: string): string {
  return ENTITY_TYPE_LABEL_ES[entityType] ?? entityType;
}
