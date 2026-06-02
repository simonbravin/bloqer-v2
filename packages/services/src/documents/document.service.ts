import { prisma } from "@bloqer/database";
import type { LinkedEntityType } from "@bloqer/database";
import { buildStorageKey, putObject, getPresignedGetUrl } from "@bloqer/storage";
import { isStorageConfigured } from "@bloqer/config";
import { can, type PermissionModule } from "@bloqer/domain";
import { ServiceContext, ServiceError } from "../types";
import { log } from "../audit/audit.service";
import { createSystemNotification } from "../notifications/notification.service";
import type { CreateDocumentMetadataInput, InitiateUploadInput, ListProjectDocumentsInput } from "@bloqer/validators";
import { ALLOWED_MIME_TYPES } from "@bloqer/validators";
import {
  assertTenantModuleEnabledWithGate,
  getTenantModuleGate,
  type TenantModuleGate,
} from "../tenant-modules/tenant-module.service";
import { assertProjectAllowsBudgetPlanning } from "../project/project-operational-guard";

const MAX_SIZE_BYTES = 50 * 1024 * 1024;

/** Default age after which an UPLOADING row is considered abandoned (1 hour) — admin batch cleanup. */
const DEFAULT_STALE_UPLOAD_THRESHOLD_MS = 60 * 60 * 1000;

/** Server-side uploads finish in seconds; rows in UPLOADING beyond this are legacy/crashed. */
const ABANDONED_UPLOAD_THRESHOLD_MS = 60 * 1000;

// ─── Types ────────────────────────────────────────────────────────────────────

export type DocumentAttachmentView = {
  id:               string;
  tenantId:         string;
  companyId:        string | null;
  projectId:        string | null;
  originalFileName: string;
  fileName:         string;
  mimeType:         string;
  sizeBytes:        number;
  storageProvider:  string;
  category:         string;
  description:      string | null;
  status:           string;
  linkedEntityType: string | null;
  linkedEntityId:   string | null;
  uploadedBy:       string;
  createdAt:        string;
  updatedAt:        string;
  /** Server-computed: archive/restore/delete/confirm allowed for this row given `linkedEntityType` + roles. */
  canMutate:        boolean;
  /** When present, the tenant has this module disabled; reads/downloads remain allowed; `canMutate` is false. */
  disabledLinkedModule?: PermissionModule;
};

export type CleanupStaleUploadingOptions = {
  /** Rows with createdAt older than now minus this interval are soft-deleted. Default 1 hour. */
  olderThanMs?: number;
};

export type CleanupStaleUploadingResult = {
  cleanedCount: number;
  /** Ids that matched at query time (normally equals rows updated; see cleanedCount). */
  documentIds: string[];
};

// ─── Service ──────────────────────────────────────────────────────────────────

export async function createDocumentMetadata(
  input: CreateDocumentMetadataInput,
  ctx: ServiceContext,
): Promise<DocumentAttachmentView> {
  if (!can(ctx.roles, "EDIT", "PROJECTS")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para subir documentos");
  }

  const project = await prisma.project.findUnique({
    where:  { id: input.projectId },
    select: { id: true, tenantId: true },
  });
  if (!project) throw new ServiceError("NOT_FOUND", "Proyecto no encontrado");
  if (project.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
  await assertProjectAllowsBudgetPlanning(input.projectId, ctx.tenantId);

  const gate = await getTenantModuleGate(ctx);
  assertTenantModuleEnabledWithGate(gate, "PROJECTS");

  const id         = crypto.randomUUID();
  const fileName   = sanitize(input.originalFileName);
  const storageKey = buildStorageKey(ctx.tenantId, input.projectId, id, input.originalFileName);

  const doc = await prisma.documentAttachment.create({
    data: {
      id,
      tenantId:         ctx.tenantId,
      companyId:        ctx.companyId ?? null,
      projectId:        input.projectId,
      originalFileName: input.originalFileName,
      fileName,
      mimeType:         input.mimeType,
      sizeBytes:        input.sizeBytes,
      storageProvider:  "PLACEHOLDER",
      storageKey,
      category:         input.category ?? "OTHER",
      description:      input.description ?? null,
      status:           "ACTIVE",
      linkedEntityType: "PROJECT",
      linkedEntityId:   input.projectId,
      uploadedBy:       ctx.actorUserId,
    },
  });

  await log({
    tenantId:    ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action:      "document.created",
    entityType:  "DocumentAttachment",
    entityId:    doc.id,
    after:       { originalFileName: doc.originalFileName, category: doc.category, projectId: doc.projectId },
  });

  return serialize(doc, ctx, gate);
}

type DocumentUploadPlan = {
  id:               string;
  anchorProjectId:  string | null;
  fileName:         string;
  storageKey:       string;
  linkedEntityType:
    | "PROJECT"
    | "JOBSITE_LOG"
    | "CERTIFICATION"
    | "SUPPLIER_INVOICE"
    | "PURCHASE_ORDER"
    | "PURCHASE_RECEIPT"
    | "PURCHASE_REQUEST"
    | "PROCUREMENT_QUOTE"
    | "SUBCONTRACT"
    | "SUBCONTRACT_CERTIFICATION"
    | "BUDGET";
  linkedEntityId: string;
};

async function resolveDocumentUploadPlan(
  input: InitiateUploadInput,
  ctx:   ServiceContext,
): Promise<DocumentUploadPlan> {
  const linkedJobsiteLog =
    input.linkedEntityType === "JOBSITE_LOG" && input.linkedEntityId
      ? { logId: input.linkedEntityId as string }
      : null;
  const linkedCertification =
    input.linkedEntityType === "CERTIFICATION" && input.linkedEntityId
      ? { certificationId: input.linkedEntityId as string }
      : null;
  const linkedSupplierInvoice =
    input.linkedEntityType === "SUPPLIER_INVOICE" && input.linkedEntityId
      ? { supplierInvoiceId: input.linkedEntityId as string }
      : null;
  const linkedPurchaseOrder =
    input.linkedEntityType === "PURCHASE_ORDER" && input.linkedEntityId
      ? { purchaseOrderId: input.linkedEntityId as string }
      : null;
  const linkedPurchaseReceipt =
    input.linkedEntityType === "PURCHASE_RECEIPT" && input.linkedEntityId
      ? { purchaseReceiptId: input.linkedEntityId as string }
      : null;
  const linkedPurchaseRequest =
    input.linkedEntityType === "PURCHASE_REQUEST" && input.linkedEntityId
      ? { purchaseRequestId: input.linkedEntityId as string }
      : null;
  const linkedProcurementQuote =
    input.linkedEntityType === "PROCUREMENT_QUOTE" && input.linkedEntityId
      ? { procurementQuoteId: input.linkedEntityId as string }
      : null;
  const linkedSubcontract =
    input.linkedEntityType === "SUBCONTRACT" && input.linkedEntityId
      ? { subcontractId: input.linkedEntityId as string }
      : null;
  const linkedSubcontractCertification =
    input.linkedEntityType === "SUBCONTRACT_CERTIFICATION" && input.linkedEntityId
      ? { subcontractCertificationId: input.linkedEntityId as string }
      : null;
  const linkedBudget =
    input.linkedEntityType === "BUDGET" && input.linkedEntityId
      ? { budgetId: input.linkedEntityId as string }
      : null;

  if (linkedJobsiteLog) {
    if (!can(ctx.roles, "EDIT", "JOBSITE_LOG")) {
      throw new ServiceError("FORBIDDEN", "Sin permisos para adjuntar archivos al libro de obra");
    }
  } else if (linkedCertification) {
    if (!can(ctx.roles, "EDIT", "CERTIFICATIONS")) {
      throw new ServiceError("FORBIDDEN", "Sin permisos para adjuntar archivos a la certificación");
    }
  } else if (linkedSupplierInvoice) {
    if (!can(ctx.roles, "EDIT", "AP")) {
      throw new ServiceError("FORBIDDEN", "Sin permisos para adjuntar archivos a la factura de proveedor");
    }
  } else if (linkedPurchaseOrder || linkedPurchaseReceipt) {
    if (!can(ctx.roles, "EDIT", "PROCUREMENT")) {
      throw new ServiceError("FORBIDDEN", "Sin permisos para adjuntar archivos en compras");
    }
  } else if (linkedSubcontract || linkedSubcontractCertification) {
    if (!can(ctx.roles, "EDIT", "SUBCONTRACTS")) {
      throw new ServiceError("FORBIDDEN", "Sin permisos para adjuntar archivos al subcontrato");
    }
  } else if (linkedBudget) {
    if (!can(ctx.roles, "EDIT", "BUDGETS")) {
      throw new ServiceError("FORBIDDEN", "Sin permisos para adjuntar archivos al presupuesto");
    }
  } else if (!can(ctx.roles, "EDIT", "PROJECTS")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para subir documentos");
  }

  const gate = await getTenantModuleGate(ctx);
  if (linkedJobsiteLog) {
    assertTenantModuleEnabledWithGate(gate, "JOBSITE_LOG");
  } else if (linkedCertification) {
    assertTenantModuleEnabledWithGate(gate, "CERTIFICATIONS");
  } else if (linkedSupplierInvoice) {
    assertTenantModuleEnabledWithGate(gate, "AP");
  } else if (linkedPurchaseOrder || linkedPurchaseReceipt) {
    assertTenantModuleEnabledWithGate(gate, "PROCUREMENT");
  } else if (linkedSubcontract || linkedSubcontractCertification) {
    assertTenantModuleEnabledWithGate(gate, "SUBCONTRACTS");
  } else if (linkedBudget) {
    assertTenantModuleEnabledWithGate(gate, "BUDGETS");
  } else {
    assertTenantModuleEnabledWithGate(gate, "PROJECTS");
  }

  if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(input.mimeType)) {
    throw new ServiceError("VALIDATION", "Tipo de archivo no permitido");
  }
  if (input.sizeBytes > MAX_SIZE_BYTES) {
    throw new ServiceError("VALIDATION", "El archivo no puede superar 50 MB");
  }

  let anchorProjectId: string | null = null;
  let strictProjectId: string | undefined;

  if (linkedSupplierInvoice) {
    const inv = await prisma.supplierInvoice.findUnique({
      where: { id: linkedSupplierInvoice.supplierInvoiceId },
      select: { tenantId: true, projectId: true, companyId: true },
    });
    if (!inv || inv.tenantId !== ctx.tenantId) {
      throw new ServiceError("NOT_FOUND", "Factura de proveedor no encontrada");
    }
    if (inv.projectId) {
      if (!input.projectId || input.projectId !== inv.projectId) {
        throw new ServiceError("FORBIDDEN", "La factura no pertenece al proyecto indicado");
      }
      await assertProjectAllowsBudgetPlanning(inv.projectId, ctx.tenantId);
      anchorProjectId = inv.projectId;
      strictProjectId   = inv.projectId;
    } else {
      if (input.projectId) {
        throw new ServiceError("VALIDATION", "Esta factura es corporativa: no indique proyecto para el adjunto");
      }
      anchorProjectId = null;
      if (ctx.companyId && inv.companyId !== ctx.companyId) {
        throw new ServiceError("FORBIDDEN", "La factura no pertenece a la empresa activa");
      }
    }
  } else {
    if (!input.projectId) {
      throw new ServiceError("VALIDATION", "Proyecto requerido");
    }
    const project = await prisma.project.findUnique({
      where: { id: input.projectId },
      select: { id: true, tenantId: true },
    });
    if (!project) throw new ServiceError("NOT_FOUND", "Proyecto no encontrado");
    if (project.tenantId !== ctx.tenantId) throw new ServiceError("FORBIDDEN", "Cross-tenant access denied");
    await assertProjectAllowsBudgetPlanning(input.projectId, ctx.tenantId);
    anchorProjectId = input.projectId;
    strictProjectId   = input.projectId;
  }

  let linkedEntityType: DocumentUploadPlan["linkedEntityType"] = "PROJECT";
  let linkedEntityId = anchorProjectId ?? "";
  if (linkedJobsiteLog) {
    await assertJobsiteLogDocumentTarget(strictProjectId!, linkedJobsiteLog.logId, ctx);
    linkedEntityType = "JOBSITE_LOG";
    linkedEntityId   = linkedJobsiteLog.logId;
  } else if (linkedCertification) {
    await assertCertificationDocumentTarget(strictProjectId!, linkedCertification.certificationId, ctx);
    linkedEntityType = "CERTIFICATION";
    linkedEntityId   = linkedCertification.certificationId;
  } else if (linkedSupplierInvoice) {
    linkedEntityType = "SUPPLIER_INVOICE";
    linkedEntityId   = linkedSupplierInvoice.supplierInvoiceId;
  } else if (linkedPurchaseOrder) {
    await assertPurchaseOrderDocumentTarget(strictProjectId!, linkedPurchaseOrder.purchaseOrderId, ctx);
    linkedEntityType = "PURCHASE_ORDER";
    linkedEntityId   = linkedPurchaseOrder.purchaseOrderId;
  } else if (linkedPurchaseReceipt) {
    await assertPurchaseReceiptDocumentTarget(strictProjectId!, linkedPurchaseReceipt.purchaseReceiptId, ctx);
    linkedEntityType = "PURCHASE_RECEIPT";
    linkedEntityId   = linkedPurchaseReceipt.purchaseReceiptId;
  } else if (linkedPurchaseRequest) {
    await assertPurchaseRequestDocumentTarget(strictProjectId!, linkedPurchaseRequest.purchaseRequestId, ctx);
    linkedEntityType = "PURCHASE_REQUEST";
    linkedEntityId   = linkedPurchaseRequest.purchaseRequestId;
  } else if (linkedProcurementQuote) {
    await assertProcurementQuoteDocumentTarget(strictProjectId!, linkedProcurementQuote.procurementQuoteId, ctx);
    linkedEntityType = "PROCUREMENT_QUOTE";
    linkedEntityId   = linkedProcurementQuote.procurementQuoteId;
  } else if (linkedSubcontract) {
    await assertSubcontractDocumentTarget(strictProjectId!, linkedSubcontract.subcontractId, ctx);
    linkedEntityType = "SUBCONTRACT";
    linkedEntityId   = linkedSubcontract.subcontractId;
  } else if (linkedSubcontractCertification) {
    await assertSubcontractCertificationDocumentTarget(
      strictProjectId!,
      linkedSubcontractCertification.subcontractCertificationId,
      ctx,
    );
    linkedEntityType = "SUBCONTRACT_CERTIFICATION";
    linkedEntityId   = linkedSubcontractCertification.subcontractCertificationId;
  } else if (linkedBudget) {
    await assertBudgetDocumentTarget(strictProjectId!, linkedBudget.budgetId, ctx);
    linkedEntityType = "BUDGET";
    linkedEntityId   = linkedBudget.budgetId;
  }

  const id         = crypto.randomUUID();
  const fileName   = sanitize(input.originalFileName);
  const storageKey = buildStorageKey(ctx.tenantId, anchorProjectId, id, input.originalFileName);

  return {
    id,
    anchorProjectId,
    fileName,
    storageKey,
    linkedEntityType,
    linkedEntityId,
  };
}

async function notifyDocumentUploadConfirmed(
  doc: {
    id: string;
    originalFileName: string;
    uploadedBy: string | null;
    companyId: string | null;
    linkedEntityType: LinkedEntityType | null;
    linkedEntityId: string | null;
    projectId: string | null;
  },
  ctx: ServiceContext,
): Promise<void> {
  try {
    if (doc.uploadedBy?.trim()) {
      await createSystemNotification({
        tenantId: ctx.tenantId,
        companyId: doc.companyId,
        recipientUserId: doc.uploadedBy,
        type: "DOCUMENT_UPLOAD_CONFIRMED",
        title: "Documento listo",
        body: `El archivo «${doc.originalFileName}» se subió correctamente.`,
        severity: "SUCCESS",
        linkedEntityType: doc.linkedEntityType,
        linkedEntityId: doc.linkedEntityId,
        projectId: doc.projectId,
        actionUrl: doc.projectId ? `/proyectos/${doc.projectId}/documentos/${doc.id}` : null,
        metadata: { documentId: doc.id },
      });
    }
  } catch {
    /* best-effort in-app notification (Phase 8A) */
  }
}

export async function uploadDocument(
  input:   InitiateUploadInput,
  content: Buffer,
  ctx:     ServiceContext,
): Promise<{ documentId: string; storageConfigured: boolean }> {
  const configured = isStorageConfigured();

  if (input.sizeBytes === 0) {
    throw new ServiceError("VALIDATION", "El archivo está vacío");
  }
  if (configured) {
    if (content.length === 0) {
      throw new ServiceError("VALIDATION", "El archivo está vacío");
    }
    if (content.length !== input.sizeBytes) {
      throw new ServiceError("VALIDATION", "El tamaño del archivo no coincide");
    }
  }

  const plan     = await resolveDocumentUploadPlan(input, ctx);
  const provider = configured ? "R2" : "PLACEHOLDER";

  if (configured) {
    try {
      await putObject(plan.storageKey, content, input.mimeType);
    } catch {
      throw new ServiceError("VALIDATION", "Error al guardar el archivo. Intentá de nuevo.");
    }
  }

  const doc = await prisma.documentAttachment.create({
    data: {
      id:               plan.id,
      tenantId:         ctx.tenantId,
      companyId:        ctx.companyId ?? null,
      projectId:        plan.anchorProjectId,
      originalFileName: input.originalFileName,
      fileName:         plan.fileName,
      mimeType:         input.mimeType,
      sizeBytes:        input.sizeBytes,
      storageProvider:  provider,
      storageKey:       plan.storageKey,
      category:         input.category ?? "OTHER",
      description:      input.description ?? null,
      status:           "ACTIVE",
      linkedEntityType: plan.linkedEntityType,
      linkedEntityId:   plan.linkedEntityId,
      uploadedBy:       ctx.actorUserId,
    },
  });

  await log({
    tenantId:    ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action:      "document.uploaded",
    entityType:  "DocumentAttachment",
    entityId:    doc.id,
    after:       { originalFileName: doc.originalFileName, storageProvider: provider, status: "ACTIVE" },
  });

  await notifyDocumentUploadConfirmed(doc, ctx);

  return { documentId: plan.id, storageConfigured: configured };
}

export async function getDocumentDownloadUrl(
  id:  string,
  ctx: ServiceContext,
): Promise<string> {
  const doc = await prisma.documentAttachment.findUnique({ where: { id } });
  if (!doc || doc.tenantId !== ctx.tenantId) throw new ServiceError("NOT_FOUND", "Documento no encontrado");
  if (!canViewDocumentByLink(doc.linkedEntityType, ctx)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para descargar documentos");
  }
  if (doc.status === "DELETED") throw new ServiceError("FORBIDDEN", "El documento ha sido eliminado");
  if (doc.status === "UPLOADING") throw new ServiceError("CONFLICT", "El documento todavía se está subiendo");
  if (doc.storageProvider !== "R2") throw new ServiceError("CONFLICT", "Este documento no tiene archivo real adjunto");

  return getPresignedGetUrl(doc.storageKey, 300);
}

export async function archiveDocument(id: string, ctx: ServiceContext): Promise<void> {
  const gate = await getTenantModuleGate(ctx);
  const doc = await getOwned(id, ctx, gate);
  if (doc.status !== "ACTIVE") throw new ServiceError("CONFLICT", "Solo se pueden archivar documentos activos (no UPLOADING ni ARCHIVED)");

  await prisma.documentAttachment.update({ where: { id }, data: { status: "ARCHIVED" } });

  await log({
    tenantId:    ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action:      "document.archived",
    entityType:  "DocumentAttachment",
    entityId:    id,
    after:       { status: "ARCHIVED" },
  });
}

export async function restoreDocument(id: string, ctx: ServiceContext): Promise<void> {
  const gate = await getTenantModuleGate(ctx);
  const doc = await getOwned(id, ctx, gate);
  if (doc.status !== "ARCHIVED") throw new ServiceError("CONFLICT", "Solo se pueden restaurar documentos archivados");

  await prisma.documentAttachment.update({ where: { id }, data: { status: "ACTIVE" } });

  await log({
    tenantId:    ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action:      "document.reactivated",
    entityType:  "DocumentAttachment",
    entityId:    id,
    after:       { status: "ACTIVE" },
  });
}

export async function softDeleteDocument(id: string, ctx: ServiceContext): Promise<void> {
  const gate = await getTenantModuleGate(ctx);
  const doc = await getOwned(id, ctx, gate);
  if (doc.status === "DELETED") throw new ServiceError("CONFLICT", "El documento ya está eliminado");

  await prisma.documentAttachment.update({ where: { id }, data: { status: "DELETED" } });

  await log({
    tenantId:    ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action:      "document.deleted",
    entityType:  "DocumentAttachment",
    entityId:    id,
    after:       { status: "DELETED" },
  });
}

export async function getDocumentById(id: string, ctx: ServiceContext): Promise<DocumentAttachmentView> {
  const doc = await prisma.documentAttachment.findUnique({ where: { id } });
  if (!doc || doc.tenantId !== ctx.tenantId) throw new ServiceError("NOT_FOUND", "Documento no encontrado");
  if (!canViewDocumentByLink(doc.linkedEntityType, ctx)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver documentos");
  }
  const gate = await getTenantModuleGate(ctx);
  return serialize(doc, ctx, gate);
}

/**
 * Soft-deletes UPLOADING rows older than {@link ABANDONED_UPLOAD_THRESHOLD_MS}.
 * Called automatically on document list reads — no admin role required.
 * New uploads never enter UPLOADING; remaining rows are legacy abandoned attempts.
 */
async function reconcileAbandonedUploadingDocuments(
  ctx: ServiceContext,
  scope?: {
    projectId?:        string;
    linkedEntityType?: string;
    linkedEntityId?:   string;
  },
): Promise<void> {
  const cutoff = new Date(Date.now() - ABANDONED_UPLOAD_THRESHOLD_MS);
  await prisma.documentAttachment.updateMany({
    where: {
      tenantId:  ctx.tenantId,
      status:    "UPLOADING",
      createdAt: { lt: cutoff },
      ...(scope?.projectId ? { projectId: scope.projectId } : {}),
      ...(scope?.linkedEntityType && scope.linkedEntityId
        ? { linkedEntityType: scope.linkedEntityType as never, linkedEntityId: scope.linkedEntityId }
        : {}),
    },
    data: { status: "DELETED" },
  });
}

export async function listProjectDocuments(
  projectId: string,
  filters:   ListProjectDocumentsInput,
  ctx:       ServiceContext,
): Promise<DocumentAttachmentView[]> {
  if (!can(ctx.roles, "VIEW", "PROJECTS")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver documentos");
  }

  const project = await prisma.project.findUnique({
    where:  { id: projectId },
    select: { id: true, tenantId: true },
  });
  if (!project || project.tenantId !== ctx.tenantId) throw new ServiceError("NOT_FOUND", "Proyecto no encontrado");

  await reconcileAbandonedUploadingDocuments(ctx, { projectId });

  const docs = await prisma.documentAttachment.findMany({
    where: {
      tenantId:  ctx.tenantId,
      projectId,
      status:    filters.status ?? "ACTIVE",
      ...(filters.category ? { category: filters.category } : {}),
      ...(filters.search ? {
        OR: [
          { originalFileName: { contains: filters.search, mode: "insensitive" } },
          { fileName:         { contains: filters.search, mode: "insensitive" } },
          { description:      { contains: filters.search, mode: "insensitive" } },
        ],
      } : {}),
    },
    orderBy: { createdAt: "desc" },
  });

  const gate = await getTenantModuleGate(ctx);
  return docs.map((d) => serialize(d, ctx, gate));
}

export async function listEntityDocuments(
  entityType: string,
  entityId:   string,
  ctx:        ServiceContext,
  options?:   { projectId?: string },
): Promise<DocumentAttachmentView[]> {
  const scoped = [
    "JOBSITE_LOG",
    "CERTIFICATION",
    "SUPPLIER_INVOICE",
    "PURCHASE_ORDER",
    "PURCHASE_RECEIPT",
    "PURCHASE_REQUEST",
    "PROCUREMENT_QUOTE",
    "SUBCONTRACT",
    "SUBCONTRACT_CERTIFICATION",
    "BUDGET",
  ] as const;
  /** Corporate supplier invoices are listed without a project scope. */
  const needsProject =
    (scoped as readonly string[]).includes(entityType) && entityType !== "SUPPLIER_INVOICE";
  if (needsProject && !options?.projectId) {
    throw new ServiceError("VALIDATION", "projectId requerido para listar adjuntos de esta entidad");
  }

  let supplierInvoiceDocScope: { projectId?: string } = {};

  if (entityType === "JOBSITE_LOG") {
    if (!can(ctx.roles, "VIEW", "JOBSITE_LOG") && !can(ctx.roles, "VIEW", "PROJECTS")) {
      throw new ServiceError("FORBIDDEN", "Sin permisos para ver adjuntos del libro de obra");
    }
    await assertJobsiteLogDocumentTarget(options!.projectId!, entityId, ctx);
  } else if (entityType === "CERTIFICATION") {
    if (!can(ctx.roles, "VIEW", "CERTIFICATIONS") && !can(ctx.roles, "VIEW", "PROJECTS")) {
      throw new ServiceError("FORBIDDEN", "Sin permisos para ver adjuntos de la certificación");
    }
    await assertCertificationDocumentTarget(options!.projectId!, entityId, ctx);
  } else if (entityType === "SUPPLIER_INVOICE") {
    if (!can(ctx.roles, "VIEW", "AP") && !can(ctx.roles, "VIEW", "PROJECTS")) {
      throw new ServiceError("FORBIDDEN", "Sin permisos para ver adjuntos de la factura de proveedor");
    }
    const { invoiceProjectId } = await assertSupplierInvoiceDocumentTarget(options?.projectId, entityId, ctx);
    if (invoiceProjectId != null) supplierInvoiceDocScope = { projectId: invoiceProjectId };
  } else if (entityType === "PURCHASE_ORDER") {
    if (!can(ctx.roles, "VIEW", "PROCUREMENT") && !can(ctx.roles, "VIEW", "PROJECTS")) {
      throw new ServiceError("FORBIDDEN", "Sin permisos para ver adjuntos de la orden de compra");
    }
    await assertPurchaseOrderDocumentTarget(options!.projectId!, entityId, ctx);
  } else if (entityType === "PURCHASE_RECEIPT") {
    if (!can(ctx.roles, "VIEW", "PROCUREMENT") && !can(ctx.roles, "VIEW", "PROJECTS")) {
      throw new ServiceError("FORBIDDEN", "Sin permisos para ver adjuntos de la recepción");
    }
    await assertPurchaseReceiptDocumentTarget(options!.projectId!, entityId, ctx);
  } else if (entityType === "PURCHASE_REQUEST") {
    if (
      !can(ctx.roles, "VIEW", "PURCHASE_REQUESTS") &&
      !can(ctx.roles, "VIEW", "PROCUREMENT") &&
      !can(ctx.roles, "VIEW", "PROJECTS")
    ) {
      throw new ServiceError("FORBIDDEN", "Sin permisos para ver adjuntos de la solicitud");
    }
    await assertPurchaseRequestDocumentTarget(options!.projectId!, entityId, ctx);
  } else if (entityType === "PROCUREMENT_QUOTE") {
    if (!can(ctx.roles, "VIEW", "PROCUREMENT") && !can(ctx.roles, "VIEW", "PROJECTS")) {
      throw new ServiceError("FORBIDDEN", "Sin permisos para ver adjuntos de la cotización");
    }
    await assertProcurementQuoteDocumentTarget(options!.projectId!, entityId, ctx);
  } else if (entityType === "SUBCONTRACT") {
    if (!can(ctx.roles, "VIEW", "SUBCONTRACTS") && !can(ctx.roles, "VIEW", "PROJECTS")) {
      throw new ServiceError("FORBIDDEN", "Sin permisos para ver adjuntos del subcontrato");
    }
    await assertSubcontractDocumentTarget(options!.projectId!, entityId, ctx);
  } else if (entityType === "SUBCONTRACT_CERTIFICATION") {
    if (!can(ctx.roles, "VIEW", "SUBCONTRACTS") && !can(ctx.roles, "VIEW", "PROJECTS")) {
      throw new ServiceError("FORBIDDEN", "Sin permisos para ver adjuntos de la certificación de subcontrato");
    }
    await assertSubcontractCertificationDocumentTarget(options!.projectId!, entityId, ctx);
  } else if (entityType === "BUDGET") {
    if (!can(ctx.roles, "VIEW", "BUDGETS") && !can(ctx.roles, "VIEW", "PROJECTS")) {
      throw new ServiceError("FORBIDDEN", "Sin permisos para ver adjuntos del presupuesto");
    }
    await assertBudgetDocumentTarget(options!.projectId!, entityId, ctx);
  } else {
    throw new ServiceError("VALIDATION", "Tipo de entidad no soportado para adjuntos");
  }

  await reconcileAbandonedUploadingDocuments(ctx, {
    projectId:        needsProject ? options?.projectId : undefined,
    linkedEntityType: entityType,
    linkedEntityId:   entityId,
  });

  const docs = await prisma.documentAttachment.findMany({
    where: {
      tenantId:         ctx.tenantId,
      linkedEntityType: entityType as never,
      linkedEntityId:   entityId,
      status:           { not: "DELETED" },
      ...supplierInvoiceDocScope,
      ...(needsProject && options?.projectId ? { projectId: options.projectId } : {}),
    },
    orderBy: { createdAt: "desc" },
  });

  const gate = await getTenantModuleGate(ctx);
  return docs.map((d) => serialize(d, ctx, gate));
}

/**
 * Soft-deletes abandoned uploads: UPLOADING rows older than the threshold for this tenant.
 * Does not delete R2 objects (P-DOC-01B / future job may add orphan object cleanup).
 * Requires OWNER or ADMIN. Intended for future cron or internal admin tooling — no HTTP route yet.
 */
export async function cleanupStaleUploadingDocuments(
  ctx: ServiceContext,
  options?: CleanupStaleUploadingOptions,
): Promise<CleanupStaleUploadingResult> {
  if (!ctx.roles.some((r) => r === "OWNER" || r === "ADMIN")) {
    throw new ServiceError("FORBIDDEN", "Solo administradores pueden ejecutar la limpieza de subidas abandonadas");
  }

  const olderThanMs = options?.olderThanMs ?? DEFAULT_STALE_UPLOAD_THRESHOLD_MS;
  const cutoff      = new Date(Date.now() - olderThanMs);

  const { cleanedCount, documentIds } = await prisma.$transaction(async (tx) => {
    const candidates = await tx.documentAttachment.findMany({
      where: {
        tenantId:  ctx.tenantId,
        status:    "UPLOADING",
        createdAt: { lt: cutoff },
      },
      select: { id: true },
    });
    const documentIds = candidates.map((c) => c.id);
    if (documentIds.length === 0) {
      return { cleanedCount: 0, documentIds: [] as string[] };
    }

    const updated = await tx.documentAttachment.updateMany({
      where: {
        tenantId: ctx.tenantId,
        id:       { in: documentIds },
        status:   "UPLOADING",
      },
      data: { status: "DELETED" },
    });

    return { cleanedCount: updated.count, documentIds };
  });

  if (cleanedCount > 0) {
    await log({
      tenantId:    ctx.tenantId,
      actorUserId: ctx.actorUserId,
      action:      "document.stale_upload_batch_cleaned",
      entityType:  "Tenant",
      entityId:    ctx.tenantId,
      after:       {
        cleanedCount,
        documentIds,
        olderThanMs,
        cutoffIso: cutoff.toISOString(),
      },
    });
  }

  return { cleanedCount, documentIds };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sanitize(filename: string): string {
  return filename
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_{2,}/g, "_")
    .toLowerCase();
}

async function getOwned(id: string, ctx: ServiceContext, gate: TenantModuleGate) {
  const doc = await prisma.documentAttachment.findUnique({ where: { id } });
  if (!doc || doc.tenantId !== ctx.tenantId) throw new ServiceError("NOT_FOUND", "Documento no encontrado");
  assertLinkedEntityTenantModuleEnabled(gate, doc.linkedEntityType);
  if (!canMutateDocumentByLink(doc.linkedEntityType, ctx)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para modificar documentos");
  }
  return doc;
}

async function assertBudgetDocumentTarget(
  projectId: string,
  budgetId: string,
  ctx:       ServiceContext,
): Promise<void> {
  const b = await prisma.budget.findUnique({
    where:  { id: budgetId },
    select: { id: true, tenantId: true, projectId: true },
  });
  if (!b || b.tenantId !== ctx.tenantId) {
    throw new ServiceError("NOT_FOUND", "Presupuesto no encontrado");
  }
  if (b.projectId !== projectId) {
    throw new ServiceError("FORBIDDEN", "El presupuesto no pertenece a este proyecto");
  }
}

/** Jobsite log must exist, match tenant, and belong to the given project. */
async function assertJobsiteLogDocumentTarget(
  projectId:    string,
  jobsiteLogId: string,
  ctx:          ServiceContext,
): Promise<void> {
  const jl = await prisma.jobsiteLog.findUnique({
    where:  { id: jobsiteLogId },
    select: { id: true, tenantId: true, projectId: true },
  });
  if (!jl || jl.tenantId !== ctx.tenantId) {
    throw new ServiceError("NOT_FOUND", "Parte de obra no encontrado");
  }
  if (jl.projectId !== projectId) {
    throw new ServiceError("FORBIDDEN", "El parte no pertenece a este proyecto");
  }
}

/** Certification must exist, match tenant, and belong to the given project. */
async function assertCertificationDocumentTarget(
  projectId:        string,
  certificationId: string,
  ctx:              ServiceContext,
): Promise<void> {
  const c = await prisma.certification.findUnique({
    where:  { id: certificationId },
    select: { id: true, tenantId: true, projectId: true },
  });
  if (!c || c.tenantId !== ctx.tenantId) {
    throw new ServiceError("NOT_FOUND", "Certificación no encontrada");
  }
  if (c.projectId !== projectId) {
    throw new ServiceError("FORBIDDEN", "La certificación no pertenece a este proyecto");
  }
}

async function assertSupplierInvoiceDocumentTarget(
  routeProjectId: string | null | undefined,
  supplierInvoiceId: string,
  ctx: ServiceContext,
): Promise<{ invoiceProjectId: string | null }> {
  const inv = await prisma.supplierInvoice.findUnique({
    where: { id: supplierInvoiceId },
    select: { tenantId: true, projectId: true, companyId: true },
  });
  if (!inv || inv.tenantId !== ctx.tenantId) {
    throw new ServiceError("NOT_FOUND", "Factura de proveedor no encontrada");
  }
  if (inv.projectId != null) {
    if (routeProjectId !== inv.projectId) {
      throw new ServiceError("FORBIDDEN", "La factura no pertenece a este proyecto");
    }
  } else {
    if (ctx.companyId && inv.companyId !== ctx.companyId) {
      throw new ServiceError("FORBIDDEN", "La factura no pertenece a la empresa activa");
    }
    if (routeProjectId != null && routeProjectId !== "") {
      throw new ServiceError("VALIDATION", "Esta factura es corporativa; no use filtro por proyecto");
    }
  }
  return { invoiceProjectId: inv.projectId };
}

async function assertPurchaseOrderDocumentTarget(
  projectId:      string,
  purchaseOrderId: string,
  ctx:            ServiceContext,
): Promise<void> {
  const po = await prisma.purchaseOrder.findUnique({
    where:  { id: purchaseOrderId },
    select: { id: true, tenantId: true, projectId: true },
  });
  if (!po || po.tenantId !== ctx.tenantId) {
    throw new ServiceError("NOT_FOUND", "Orden de compra no encontrada");
  }
  if (po.projectId !== projectId) {
    throw new ServiceError("FORBIDDEN", "La orden de compra no pertenece a este proyecto");
  }
}

async function assertPurchaseReceiptDocumentTarget(
  projectId:         string,
  purchaseReceiptId: string,
  ctx:               ServiceContext,
): Promise<void> {
  const r = await prisma.purchaseReceipt.findUnique({
    where:  { id: purchaseReceiptId },
    select: { id: true, tenantId: true, projectId: true },
  });
  if (!r || r.tenantId !== ctx.tenantId) {
    throw new ServiceError("NOT_FOUND", "Recepción no encontrada");
  }
  if (r.projectId !== projectId) {
    throw new ServiceError("FORBIDDEN", "La recepción no pertenece a este proyecto");
  }
}

async function assertPurchaseRequestDocumentTarget(
  projectId: string,
  purchaseRequestId: string,
  ctx: ServiceContext,
): Promise<void> {
  const pr = await prisma.purchaseRequest.findUnique({
    where: { id: purchaseRequestId },
    select: { id: true, tenantId: true, projectId: true },
  });
  if (!pr || pr.tenantId !== ctx.tenantId) {
    throw new ServiceError("NOT_FOUND", "Solicitud de compra no encontrada");
  }
  if (pr.projectId !== projectId) {
    throw new ServiceError("FORBIDDEN", "La solicitud no pertenece a este proyecto");
  }
}

async function assertProcurementQuoteDocumentTarget(
  projectId: string,
  procurementQuoteId: string,
  ctx: ServiceContext,
): Promise<void> {
  const quote = await prisma.procurementQuote.findUnique({
    where: { id: procurementQuoteId },
    include: { purchaseRequest: { select: { projectId: true, tenantId: true } } },
  });
  if (!quote || quote.tenantId !== ctx.tenantId) {
    throw new ServiceError("NOT_FOUND", "Cotización no encontrada");
  }
  if (quote.purchaseRequest.projectId !== projectId) {
    throw new ServiceError("FORBIDDEN", "La cotización no pertenece a este proyecto");
  }
}

async function assertSubcontractDocumentTarget(
  projectId:    string,
  subcontractId: string,
  ctx:          ServiceContext,
): Promise<void> {
  const s = await prisma.subcontract.findUnique({
    where:  { id: subcontractId },
    select: { id: true, tenantId: true, projectId: true },
  });
  if (!s || s.tenantId !== ctx.tenantId) {
    throw new ServiceError("NOT_FOUND", "Subcontrato no encontrado");
  }
  if (s.projectId !== projectId) {
    throw new ServiceError("FORBIDDEN", "El subcontrato no pertenece a este proyecto");
  }
}

async function assertSubcontractCertificationDocumentTarget(
  projectId:                  string,
  subcontractCertificationId: string,
  ctx:                        ServiceContext,
): Promise<void> {
  const c = await prisma.subcontractCertification.findUnique({
    where:  { id: subcontractCertificationId },
    select: { id: true, tenantId: true, projectId: true, subcontractId: true },
  });
  if (!c || c.tenantId !== ctx.tenantId) {
    throw new ServiceError("NOT_FOUND", "Certificación de subcontrato no encontrada");
  }
  if (c.projectId !== projectId) {
    throw new ServiceError("FORBIDDEN", "La certificación no pertenece a este proyecto");
  }
}

function canViewDocumentByLink(
  linkedEntityType: string | null,
  ctx:              ServiceContext,
): boolean {
  if (can(ctx.roles, "VIEW", "PROJECTS")) return true;
  if (linkedEntityType === "JOBSITE_LOG" && can(ctx.roles, "VIEW", "JOBSITE_LOG")) return true;
  if (linkedEntityType === "CERTIFICATION" && can(ctx.roles, "VIEW", "CERTIFICATIONS")) return true;
  if (linkedEntityType === "SUPPLIER_INVOICE" && can(ctx.roles, "VIEW", "AP")) return true;
  if (
    (linkedEntityType === "PURCHASE_ORDER" ||
      linkedEntityType === "PURCHASE_RECEIPT" ||
      linkedEntityType === "PROCUREMENT_QUOTE") &&
    can(ctx.roles, "VIEW", "PROCUREMENT")
  ) {
    return true;
  }
  if (linkedEntityType === "PURCHASE_REQUEST" && can(ctx.roles, "VIEW", "PURCHASE_REQUESTS")) {
    return true;
  }
  if (
    (linkedEntityType === "SUBCONTRACT" || linkedEntityType === "SUBCONTRACT_CERTIFICATION") &&
    can(ctx.roles, "VIEW", "SUBCONTRACTS")
  ) {
    return true;
  }
  if (linkedEntityType === "BUDGET" && can(ctx.roles, "VIEW", "BUDGETS")) return true;
  return false;
}

function canMutateDocumentByLink(
  linkedEntityType: string | null,
  ctx:              ServiceContext,
): boolean {
  const t = linkedEntityType ?? "PROJECT";
  if (t === "PROJECT") {
    return can(ctx.roles, "EDIT", "PROJECTS");
  }
  if (t === "JOBSITE_LOG") {
    return can(ctx.roles, "EDIT", "JOBSITE_LOG");
  }
  if (t === "CERTIFICATION") {
    return can(ctx.roles, "EDIT", "CERTIFICATIONS");
  }
  if (t === "SUPPLIER_INVOICE") {
    return can(ctx.roles, "EDIT", "AP");
  }
  if (t === "PURCHASE_ORDER" || t === "PURCHASE_RECEIPT" || t === "PROCUREMENT_QUOTE") {
    return can(ctx.roles, "EDIT", "PROCUREMENT");
  }
  if (t === "PURCHASE_REQUEST") {
    return can(ctx.roles, "EDIT", "PURCHASE_REQUESTS");
  }
  if (t === "SUBCONTRACT" || t === "SUBCONTRACT_CERTIFICATION") {
    return can(ctx.roles, "EDIT", "SUBCONTRACTS");
  }
  if (t === "BUDGET") {
    return can(ctx.roles, "EDIT", "BUDGETS");
  }
  return false;
}

function linkedEntityTypeToPermissionModule(linkedEntityType: string | null): PermissionModule {
  const t = linkedEntityType ?? "PROJECT";
  if (t === "PROJECT") return "PROJECTS";
  if (t === "JOBSITE_LOG") return "JOBSITE_LOG";
  if (t === "CERTIFICATION") return "CERTIFICATIONS";
  if (t === "SUPPLIER_INVOICE") return "AP";
  if (t === "PURCHASE_ORDER" || t === "PURCHASE_RECEIPT" || t === "PROCUREMENT_QUOTE") {
    return "PROCUREMENT";
  }
  if (t === "PURCHASE_REQUEST") return "PURCHASE_REQUESTS";
  if (t === "SUBCONTRACT" || t === "SUBCONTRACT_CERTIFICATION") return "SUBCONTRACTS";
  if (t === "BUDGET") return "BUDGETS";
  return "PROJECTS";
}

function assertLinkedEntityTenantModuleEnabled(gate: TenantModuleGate, linkedEntityType: string | null): void {
  assertTenantModuleEnabledWithGate(gate, linkedEntityTypeToPermissionModule(linkedEntityType));
}

function serialize(
  doc: {
    id: string; tenantId: string; companyId: string | null; projectId: string | null;
    originalFileName: string; fileName: string; mimeType: string; sizeBytes: number;
    storageProvider: string; category: string; description: string | null;
    status: string; linkedEntityType: string | null; linkedEntityId: string | null;
    uploadedBy: string; createdAt: Date; updatedAt: Date;
  },
  ctx: ServiceContext,
  gate: TenantModuleGate,
): DocumentAttachmentView {
  const mod = linkedEntityTypeToPermissionModule(doc.linkedEntityType);
  const moduleDisabled = !gate.isEnabled(mod);
  return {
    id:               doc.id,
    tenantId:         doc.tenantId,
    companyId:        doc.companyId,
    projectId:        doc.projectId,
    originalFileName: doc.originalFileName,
    fileName:         doc.fileName,
    mimeType:         doc.mimeType,
    sizeBytes:        doc.sizeBytes,
    storageProvider:  doc.storageProvider as string,
    category:         doc.category as string,
    description:      doc.description,
    status:           doc.status as string,
    linkedEntityType: doc.linkedEntityType as string | null,
    linkedEntityId:   doc.linkedEntityId,
    uploadedBy:       doc.uploadedBy,
    createdAt:        doc.createdAt.toISOString(),
    updatedAt:        doc.updatedAt.toISOString(),
    canMutate:        canMutateDocumentByLink(doc.linkedEntityType, ctx) && !moduleDisabled,
    ...(moduleDisabled ? { disabledLinkedModule: mod } : {}),
  };
}
