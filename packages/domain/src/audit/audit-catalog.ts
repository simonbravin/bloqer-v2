/** UI filter modules for tenant audit log (es-AR labels live in apps/web). */
export const AUDIT_UI_MODULES = [
  "PROCUREMENT",
  "AP",
  "AR",
  "TREASURY",
  "INVENTORY",
  "BUDGET",
  "CERTIFICATIONS",
  "SUBCONTRACTS",
  "SCHEDULE",
  "JOBSITE_LOG",
  "ACCOUNTING",
  "PROJECTS",
  "DIRECTORY",
  "CONFIGURATION",
  "DOCUMENTS",
] as const;

export type AuditUiModule = (typeof AUDIT_UI_MODULES)[number];

export const AUDIT_UI_MODULE_LABEL_ES: Record<AuditUiModule, string> = {
  PROCUREMENT: "Compras",
  AP: "Cuentas a pagar",
  AR: "Cuentas a cobrar",
  TREASURY: "Tesorería",
  INVENTORY: "Inventario",
  BUDGET: "Presupuesto",
  CERTIFICATIONS: "Certificaciones",
  SUBCONTRACTS: "Subcontratos",
  SCHEDULE: "Cronograma",
  JOBSITE_LOG: "Parte de obra",
  ACCOUNTING: "Contabilidad",
  PROJECTS: "Proyectos",
  DIRECTORY: "Directorio",
  CONFIGURATION: "Configuración",
  DOCUMENTS: "Documentos",
};

export const AUDIT_MODULE_ENTITY_TYPES: Record<AuditUiModule, readonly string[]> = {
  PROCUREMENT: ["PurchaseOrder", "PurchaseReceipt"],
  AP: ["SupplierInvoice", "Payable", "Payment"],
  AR: ["SalesInvoice", "Receivable", "Collection"],
  TREASURY: ["TreasuryAccount", "AccountMovement", "InternalTransfer"],
  INVENTORY: ["Product", "Warehouse", "StockMovement", "WarehouseTransfer"],
  BUDGET: ["Budget", "WbsNode", "CostItem", "CostAnalysisLine"],
  CERTIFICATIONS: ["Certification", "CertificationLine"],
  SUBCONTRACTS: ["Subcontract", "SubcontractCertification"],
  SCHEDULE: ["Schedule", "ScheduleItem"],
  JOBSITE_LOG: ["JobsiteLog"],
  ACCOUNTING: ["JournalEntry", "AccountingAccount", "AccountingMappingRule"],
  PROJECTS: ["Project"],
  DIRECTORY: [
    "Contact",
    "ContactRole",
    "ClientProfile",
    "SupplierProfile",
    "SubcontractorProfile",
  ],
  CONFIGURATION: ["Tenant", "UserMembership", "TenantInvitation", "Company"],
  DOCUMENTS: ["DocumentAttachment"],
};

const ENTITY_TYPE_TO_MODULE = new Map<string, AuditUiModule>();
for (const [mod, types] of Object.entries(AUDIT_MODULE_ENTITY_TYPES) as [AuditUiModule, readonly string[]][]) {
  for (const t of types) ENTITY_TYPE_TO_MODULE.set(t, mod);
}

export function resolveAuditModuleForEntityType(entityType: string): AuditUiModule | null {
  return ENTITY_TYPE_TO_MODULE.get(entityType) ?? null;
}

export function entityTypesForAuditModule(module: AuditUiModule): readonly string[] {
  return AUDIT_MODULE_ENTITY_TYPES[module];
}

/** Known action → es-AR label. Unknown actions fall back to raw action string in UI. */
export const AUDIT_ACTION_LABELS_ES: Record<string, string> = {
  // Procurement (legacy + canonical aliases)
  PURCHASE_ORDER_CREATED: "Orden de compra creada",
  PURCHASE_ORDER_UPDATED: "Orden de compra actualizada",
  PURCHASE_ORDER_ISSUED: "Orden de compra emitida",
  PURCHASE_ORDER_CANCELLED: "Orden de compra anulada",
  "purchase_order.created": "Orden de compra creada",
  "purchase_order.updated": "Orden de compra actualizada",
  "purchase_order.issued": "Orden de compra emitida",
  "purchase_order.cancelled": "Orden de compra anulada",
  PURCHASE_RECEIPT_CREATED: "Recepción creada",
  PURCHASE_RECEIPT_CONFIRMED: "Recepción confirmada",
  PURCHASE_RECEIPT_CANCELLED: "Recepción anulada",
  "purchase_receipt.created": "Recepción creada",
  "purchase_receipt.confirmed": "Recepción confirmada",
  "purchase_receipt.cancelled": "Recepción anulada",
  // AP / AR / Treasury
  "supplier_invoice.created": "Factura de proveedor creada",
  "supplier_invoice.updated": "Factura de proveedor actualizada",
  "supplier_invoice.issued": "Factura de proveedor emitida",
  "supplier_invoice.cancelled": "Factura de proveedor anulada",
  "supplier_invoice.registered_expense": "Gasto registrado",
  "payment.confirmed": "Pago confirmado",
  "payment.cancelled": "Pago anulado",
  "payable.cancelled": "Cuenta por pagar anulada",
  "treasury_account.created": "Cuenta de tesorería creada",
  "treasury_account.updated": "Cuenta de tesorería actualizada",
  "treasury_account.deactivated": "Cuenta de tesorería desactivada",
  "treasury_account.reactivated": "Cuenta de tesorería reactivada",
  "sales_invoice.created": "Factura de venta creada",
  "sales_invoice.updated": "Factura de venta actualizada",
  "sales_invoice.issued": "Factura de venta emitida",
  "sales_invoice.cancelled": "Factura de venta anulada",
  "sales_invoice.registered_sale": "Venta registrada",
  "sales_invoice.created_from_certification": "Factura generada desde certificación",
  "receivable.cancelled": "Cuenta a cobrar anulada",
  "collection.confirmed": "Cobranza confirmada",
  "collection.cancelled": "Cobranza anulada",
  "account_movement.confirmed": "Movimiento confirmado",
  "account_movement.cancelled": "Movimiento anulado",
  "internal_transfer.created": "Transferencia interna creada",
  "internal_transfer.cancelled": "Transferencia interna anulada",
  // Budget
  "budget.created": "Presupuesto creado",
  "budget.updated": "Presupuesto actualizado",
  "budget.approved": "Presupuesto aprobado",
  "budget.submitted": "Presupuesto enviado a revisión",
  "budget.returned": "Presupuesto devuelto para cambios",
  "budget.closed": "Presupuesto cerrado",
  "wbs_node.added": "Ítem WBS agregado",
  "wbs_node.updated": "Ítem WBS actualizado",
  "wbs_node.removed": "Ítem WBS eliminado",
  "wbs_nodes.reordered": "Ítems WBS reordenados",
  "cost_item.updated": "Ítem de costo actualizado",
  "cost_analysis_line.added": "Línea de análisis agregada",
  "cost_analysis_line.updated": "Línea de análisis actualizada",
  "cost_analysis_line.removed": "Línea de análisis eliminada",
  // Certifications / subcontracts
  "certification.created": "Certificación creada",
  "certification.updated": "Certificación actualizada",
  "certification.issued": "Certificación emitida",
  "certification_line.added": "Línea de certificación agregada",
  "certification_line.updated": "Línea de certificación actualizada",
  "certification_line.removed": "Línea de certificación eliminada",
  SUBCONTRACT_CREATED: "Subcontrato creado",
  SUBCONTRACT_UPDATED: "Subcontrato actualizado",
  SUBCONTRACT_ACTIVATED: "Subcontrato activado",
  SUBCONTRACT_COMPLETED: "Subcontrato completado",
  SUBCONTRACT_CANCELLED: "Subcontrato anulado",
  SUBCONTRACT_CERTIFICATION_CREATED: "Certificación de subcontrato creada",
  SUBCONTRACT_CERTIFICATION_ISSUED: "Certificación de subcontrato emitida",
  SUBCONTRACT_CERTIFICATION_APPROVED: "Certificación de subcontrato aprobada",
  SUBCONTRACT_CERTIFICATION_REJECTED: "Certificación de subcontrato rechazada",
  SUBCONTRACT_CERTIFICATION_CANCELLED: "Certificación de subcontrato anulada",
  // Schedule
  "schedule.created": "Cronograma creado",
  "schedule.imported_from_budget": "Cronograma importado desde presupuesto",
  "schedule_item.created": "Tarea de cronograma creada",
  "schedule_item.name_updated": "Nombre de tarea actualizado",
  "schedule_item.dates_updated": "Fechas de tarea actualizadas",
  "schedule_item.progress_updated": "Avance de tarea actualizado",
  "schedule_item.status_changed": "Estado de tarea cambiado",
  "schedule_item.started": "Tarea iniciada",
  "schedule_item.completed": "Tarea completada",
  "schedule_item.blocked": "Tarea bloqueada",
  "schedule_item.unblocked": "Tarea desbloqueada",
  "schedule_item.cancelled": "Tarea cancelada",
  "schedule_item.wbs_linked": "WBS vinculado a tarea",
  "schedule_item.wbs_unlinked": "WBS desvinculado de tarea",
  "schedule_dependency.added": "Dependencia agregada",
  "schedule_dependency.removed": "Dependencia eliminada",
  SCHEDULE_PROGRESS_SYNCED_FROM_JOBSITE_LOG: "Avance de cronograma sincronizado desde libro de obra",
  // Jobsite log
  JOBSITE_LOG_CREATED: "Parte de obra creado",
  JOBSITE_LOG_UPDATED: "Parte de obra actualizado",
  JOBSITE_LOG_SUBMITTED: "Parte de obra enviado",
  JOBSITE_LOG_APPROVED: "Parte de obra aprobado",
  JOBSITE_LOG_RETURNED: "Parte de obra devuelto",
  JOBSITE_LOG_CANCELLED: "Parte de obra anulado",
  // Accounting
  "journal_entry.created": "Asiento creado",
  "journal_entry.updated": "Asiento actualizado",
  "journal_entry.posted": "Asiento contabilizado",
  "journal_entry.cancelled": "Asiento anulado",
  "accounting_account.created": "Cuenta contable creada",
  "accounting_account.updated": "Cuenta contable actualizada",
  "accounting_mapping_rule.created": "Regla de mapeo creada",
  "accounting_mapping_rule.updated": "Regla de mapeo actualizada",
  // Projects / config / directory
  "project.created": "Proyecto creado",
  "project.updated": "Proyecto actualizado",
  TENANT_ONBOARDING_COMPLETED: "Onboarding completado",
  TENANT_DISPLAY_SETTINGS_UPDATED: "Configuración de tenant actualizada",
  TENANT_PERMISSION_MATRIX_NOTES_UPDATED: "Notas de permisos actualizadas",
  COMPANY_CREATED: "Empresa creada",
  MEMBERSHIP_CREATED: "Membresía creada",
  USER_PROFILE_UPDATED: "Perfil de usuario actualizado",
  USER_STATUS_UPDATED: "Estado de usuario actualizado",
};

export function resolveAuditActionLabel(action: string): string {
  return AUDIT_ACTION_LABELS_ES[action] ?? action;
}

/** Entity types resolvable to a project (excludes tenant-wide config/directory). */
export const ALL_PROJECT_SCOPED_ENTITY_TYPES: readonly string[] = [
  ...new Set(
    AUDIT_UI_MODULES.filter((m) => m !== "CONFIGURATION" && m !== "DIRECTORY").flatMap(
      (m) => AUDIT_MODULE_ENTITY_TYPES[m],
    ),
  ),
];

/** Modules whose audit entries are tenant-wide (project filter does not apply). */
export const AUDIT_MODULES_WITHOUT_PROJECT_SCOPE: readonly AuditUiModule[] = [
  "CONFIGURATION",
  "DIRECTORY",
];
