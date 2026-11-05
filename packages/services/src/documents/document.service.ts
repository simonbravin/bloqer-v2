import { prisma } from "@bloqer/database";
import type { DocumentAttachment, LinkedEntityType, Prisma } from "@bloqer/database";
import {
  buildStorageKey,
  putObject,
  getObjectBytes,
  getObjectByteRange,
  getPresignedPutUrl,
  getPresignedGetUrl,
  deleteObject,
  headObject,
  buildContentDispositionHeader,
  type ContentDispositionKind,
} from "@bloqer/storage";
import { isStorageConfigured } from "@bloqer/config";
import { can, type PermissionModule } from "@bloqer/domain";
import { ServiceContext, ServiceError } from "../types";
import { companyScopeFilter } from "../company-scope";
import { log } from "../audit/audit.service";
import { createSystemNotification } from "../notifications/notification.service";
import { filterNotificationAudienceForScope, resolveNotificationAudience } from "../notifications/notification-audience.service";
import {
  documentUploadConfirmedCopy,
  resolveDocumentNotificationEntityLabel,
} from "../notifications/notification-copy";
import type { CreateDocumentMetadataInput, InitiateUploadInput, ListProjectDocumentsInput } from "@bloqer/validators";
import { isInlineDocumentPreviewMime, resolveAllowedMimeType } from "@bloqer/validators";
import type { AllowedMimeType } from "@bloqer/validators";
import {
  assertTenantModuleEnabledWithGate,
  getTenantModuleGate,
  type TenantModuleGate,
} from "../tenant-modules/tenant-module.service";
import { assertProjectAllowsBudgetPlanning, lockProjectForBudgetPlanning } from "../project/project-operational-guard";
import { requireProjectAccess } from "../security/access";
import { assertOptimisticRowUpdate } from "../finance/optimistic-lock";
import {
  documentReplayMatches,
  requireIdempotencyKey,
  sha256Hex,
  withIdempotentCreate,
} from "../idempotency/idempotency";
import { assertUploadContentMatchesDeclaredMime } from "./sniff-upload-content";
import {
  canSoftDeleteDocumentByLink,
  LINKED_DOCUMENT_DELETE_BLOCKED_MESSAGE,
} from "./document-delete-policy";
import {
  backfillProjectDocumentFolders,
  getFolderInProjectOrThrow,
  resolveFolderIdForUpload,
} from "./document-folder.service";
import {
  assertDocumentCompanyInTenant,
  canMutateDocumentByLink,
  canViewDocumentByLink,
  documentMatchesScope,
  documentScopeInProject,
  filterProjectDocumentsByLink,
  isDocumentOperationalLink,
  requireDocumentLinkAccess,
  requireDocumentParent,
  type DocumentLinkScope,
} from "./document-link-scope";

export {
  canSoftDeleteDocumentByLink,
  isStandaloneProjectDocument,
  LINKED_DOCUMENT_DELETE_BLOCKED_MESSAGE,
} from "./document-delete-policy";

const MAX_SIZE_BYTES = 50 * 1024 * 1024;

/**
 * Trust extension + allowlist, not a client-claimed MIME alone.
 * Critical for CAD/Office where byte sniff is skipped or weak.
 */
function canonicalizeDeclaredUploadMime(originalFileName: string, declaredMime: string): AllowedMimeType {
  const resolved = resolveAllowedMimeType(originalFileName, declaredMime);
  if (!resolved) {
    throw new ServiceError("VALIDATION", "Tipo de archivo no permitido");
  }
  if (resolved !== declaredMime) {
    throw new ServiceError(
      "VALIDATION",
      "El tipo de archivo no coincide con la extensión del nombre",
    );
  }
  const ext = originalFileName.split(".").pop()?.toLowerCase() ?? "";
  if (declaredMime === "image/vnd.dwg" && ext !== "dwg") {
    throw new ServiceError(
      "VALIDATION",
      "El tipo de archivo no coincide con la extensión del nombre",
    );
  }
  if (declaredMime === "image/vnd.dxf" && ext !== "dxf") {
    throw new ServiceError(
      "VALIDATION",
      "El tipo de archivo no coincide con la extensión del nombre",
    );
  }
  return resolved;
}

/** Default age after which an UPLOADING row is considered abandoned (1 hour) — admin batch cleanup. */
const DEFAULT_STALE_UPLOAD_THRESHOLD_MS = 60 * 60 * 1000;

/** Hide abandoned direct uploads from the entity panel (presigned PUT is 5 min). */
const ABANDONED_UPLOAD_THRESHOLD_MS = 15 * 60 * 1000;

/** Prefix bytes fetched on confirm for MIME sniff (stay under Vercel response limits). */
const CONFIRM_SNIFF_MAX_BYTES = 64 * 1024;

// ─── Types ────────────────────────────────────────────────────────────────────

export type DocumentAttachmentView = {
  id:               string;
  tenantId:         string;
  companyId:        string | null;
  projectId:        string | null;
  folderId:         string | null;
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
  /** Optional parent/receivable route for an authorized detail or confirmed upload. */
  relatedEntityId?: string;
  uploadedBy:       string;
  createdAt:        string;
  updatedAt:        string;
  /** Server-computed: archive/restore/delete/confirm allowed for this row given `linkedEntityType` + roles. */
  canMutate:        boolean;
  /**
   * Soft-delete (or cancel UPLOADING). Library docs (`PROJECT`) only;
   * attachments of invoices / quotes / jobsite logs stay as evidence.
   */
  canDelete:        boolean;
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

  const project = await assertProjectAllowsBudgetPlanning(input.projectId, ctx);
  await assertDocumentCompanyInTenant(project.companyId ?? ctx.companyId, ctx.tenantId);

  const gate = await getTenantModuleGate(ctx);
  assertTenantModuleEnabledWithGate(gate, "PROJECTS");

  const id         = crypto.randomUUID();
  const fileName   = sanitize(input.originalFileName);
  const storageKey = buildStorageKey(ctx.tenantId, input.projectId, id, input.originalFileName);
  const folderId = await resolveFolderIdForUpload({
    projectId: input.projectId,
    linkedEntityType: "PROJECT",
    requestedFolderId: null,
    ctx,
  });

  const doc = await prisma.$transaction(async (tx) => {
    await lockDocumentUploadProject(tx, input.projectId, project.companyId ?? ctx.companyId, ctx);
    const row = await tx.documentAttachment.create({
      data: {
        id,
        tenantId:         ctx.tenantId,
        companyId:        project.companyId ?? ctx.companyId,
        projectId:        input.projectId,
        folderId,
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
      entityId:    row.id,
      projectId:   row.projectId,
      companyId:   row.companyId,
      after:       { originalFileName: row.originalFileName, category: row.category, projectId: row.projectId },
    }, tx);
    return row;
  });

  return serialize(doc, ctx, gate);
}

type DocumentUploadPlan = {
  id: string;
  anchorProjectId: string | null;
  companyId: string | null;
  fileName: string;
  storageKey: string;
  linkedEntityType: LinkedEntityType;
  linkedEntityId: string;
};

async function lockDocumentUploadProject(
  tx: Prisma.TransactionClient,
  projectId: string | null,
  companyId: string | null,
  ctx: ServiceContext,
): Promise<void> {
  if (!projectId) return;
  const current = await lockProjectForBudgetPlanning(tx, projectId, ctx);
  if (current.companyId !== null && current.companyId !== companyId) {
    throw new ServiceError("CONFLICT", "La empresa del proyecto cambió. Recargá e intentá de nuevo.");
  }
}

async function resolveDocumentUploadPlan(
  input: InitiateUploadInput,
  ctx: ServiceContext,
): Promise<DocumentUploadPlan> {
  const linkedEntityType = input.linkedEntityType ?? "PROJECT";
  const linkedEntityId = input.linkedEntityId ?? input.projectId;
  if (!linkedEntityId || (input.linkedEntityType && !input.linkedEntityId)) {
    throw new ServiceError("VALIDATION", "Proyecto o entidad del adjunto requerido");
  }

  let target: DocumentLinkScope;
  if (linkedEntityType === "PROJECT") {
    if (!input.projectId || linkedEntityId !== input.projectId) {
      throw new ServiceError("VALIDATION", "Proyecto requerido");
    }
    const project = await assertProjectAllowsBudgetPlanning(input.projectId, ctx);
    target = { ...project, projectId: project.id };
  } else {
    target = await requireDocumentParent(linkedEntityType, linkedEntityId, ctx);
    const invoice = linkedEntityType === "SUPPLIER_INVOICE" || linkedEntityType === "SALES_INVOICE";
    if ((!invoice || input.projectId != null) && input.projectId !== target.projectId) {
      throw new ServiceError("FORBIDDEN", "La entidad del adjunto no pertenece al proyecto indicado");
    }
    if (target.projectId) {
      const project = await assertProjectAllowsBudgetPlanning(target.projectId, ctx);
      const scoped = documentScopeInProject(target, project);
      if (!scoped) throw new ServiceError("CONFLICT", "La entidad del adjunto no corresponde a la empresa del proyecto");
      target = scoped;
    }
  }

  if (!canMutateDocumentByLink(linkedEntityType, ctx.roles, target.projectId)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para adjuntar archivos a esta entidad");
  }
  assertLinkedEntityTenantModuleEnabled(await getTenantModuleGate(ctx), linkedEntityType);
  await assertDocumentCompanyInTenant(target.companyId ?? ctx.companyId, ctx.tenantId);

  const id = crypto.randomUUID();
  return {
    id,
    anchorProjectId: target.projectId,
    companyId: target.companyId ?? ctx.companyId,
    fileName: sanitize(input.originalFileName),
    storageKey: buildStorageKey(ctx.tenantId, target.projectId, id, input.originalFileName),
    linkedEntityType,
    linkedEntityId,
  };
}

async function resolveCorporateDocumentActionUrl(
  linkedEntityType: LinkedEntityType | null,
  linkedEntityId: string | null,
  ctx: ServiceContext,
): Promise<string | null> {
  if (!linkedEntityType || !linkedEntityId) return null;
  if (linkedEntityType === "SUPPLIER_INVOICE") {
    return `/finanzas/facturas-proveedor/${linkedEntityId}`;
  }
  if (linkedEntityType === "SALES_INVOICE") {
    const receivable = await prisma.receivable.findUnique({
      where: { salesInvoiceId: linkedEntityId },
      select: { id: true, tenantId: true, projectId: true },
    });
    if (!receivable || receivable.tenantId !== ctx.tenantId || receivable.projectId != null) {
      return null;
    }
    return `/finanzas/cuentas-por-cobrar/${receivable.id}`;
  }
  return null;
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
    category?: string | null;
  },
  ctx: ServiceContext,
): Promise<void> {
  let scopedRecipients: string[];
  let companyId = doc.companyId;
  try {
    const recipients = await resolveNotificationAudience({
      tenantId: ctx.tenantId,
      primaryUserIds: doc.uploadedBy?.trim() ? [doc.uploadedBy.trim()] : [],
      excludeUserId: ctx.actorUserId,
    });
    if (recipients.length === 0) return;

    companyId = await requireDocumentLinkAccess({ ...doc, tenantId: ctx.tenantId }, ctx);
    scopedRecipients = await filterNotificationAudienceForScope({
      tenantId: ctx.tenantId,
      companyId,
      projectId: doc.projectId,
      candidateUserIds: recipients,
      canView: (roles) => canViewDocumentByLink(doc.linkedEntityType, roles, doc.projectId),
    });
  } catch {
    return;
  }
  if (scopedRecipients.length === 0) return;

  const actionUrl = doc.projectId
    ? `/proyectos/${doc.projectId}/documentos/${doc.id}`
    : await resolveCorporateDocumentActionUrl(doc.linkedEntityType, doc.linkedEntityId, ctx);

  const entityLabel = await resolveDocumentNotificationEntityLabel({
    tenantId: ctx.tenantId,
    linkedEntityType: doc.linkedEntityType,
    linkedEntityId: doc.linkedEntityId,
    projectId: doc.projectId,
  });
  const { title, body } = documentUploadConfirmedCopy({
    fileName: doc.originalFileName,
    entityLabel,
    category: doc.category,
  });

  for (const recipientUserId of scopedRecipients) {
    try {
      await createSystemNotification({
        tenantId: ctx.tenantId,
        companyId,
        recipientUserId,
        type: "DOCUMENT_UPLOAD_CONFIRMED",
        title,
        body,
        severity: "SUCCESS",
        linkedEntityType: doc.linkedEntityType,
        linkedEntityId: doc.linkedEntityId,
        projectId: doc.projectId,
        actionUrl,
        metadata: { documentId: doc.id },
      });
    } catch {
      /* best-effort in-app notification (Phase 8A) — one failure must not block others */
    }
  }
}

export async function uploadDocument(
  input:   InitiateUploadInput,
  content: Buffer,
  ctx:     ServiceContext,
): Promise<{ documentId: string; storageConfigured: boolean }> {
  const configured = isStorageConfigured();
  const idempotencyKey = requireIdempotencyKey(input.idempotencyKey);
  const mimeType = canonicalizeDeclaredUploadMime(input.originalFileName, input.mimeType);

  if (!Number.isSafeInteger(input.sizeBytes) || input.sizeBytes <= 0) {
    throw new ServiceError("VALIDATION", "El archivo está vacío");
  }
  if (input.sizeBytes > MAX_SIZE_BYTES) {
    throw new ServiceError("VALIDATION", "El archivo no puede superar 50 MB");
  }
  if (content.length === 0) {
    throw new ServiceError("VALIDATION", "El archivo está vacío");
  }
  if (content.length !== input.sizeBytes) {
    throw new ServiceError("VALIDATION", "El tamaño del archivo no coincide");
  }

  await assertUploadContentMatchesDeclaredMime(content, mimeType);

  const contentSha256 = sha256Hex(content);
  const plan = await resolveDocumentUploadPlan({ ...input, mimeType }, ctx);
  const folderId = await resolveFolderIdForUpload({
    projectId: plan.anchorProjectId,
    linkedEntityType: plan.linkedEntityType,
    requestedFolderId: input.folderId,
    ctx,
  });
  const provider = configured ? "R2" : "PLACEHOLDER";

  const findExisting = () =>
    prisma.documentAttachment.findFirst({
      where: { tenantId: ctx.tenantId, idempotencyKey },
    });
  const payloadsMatch = (existing: DocumentAttachment) =>
    uploadIntentMatches(existing, input, plan, folderId, ctx) && documentReplayMatches(existing, {
      contentSha256,
      linkedEntityType: plan.linkedEntityType,
      linkedEntityId: plan.linkedEntityId,
    });

  const existing = await findExisting();
  if (existing) {
    if (!payloadsMatch(existing)) {
      throw new ServiceError(
        "CONFLICT",
        "Esta operación ya se registró con datos distintos. Recargá e intentá de nuevo.",
      );
    }
    await requireDocumentLinkAccess(existing, ctx);
    return { documentId: existing.id, storageConfigured: existing.storageProvider === "R2" };
  }

  if (configured) {
    try {
      await putObject(plan.storageKey, content, mimeType);
    } catch {
      throw new ServiceError("VALIDATION", "Error al guardar el archivo. Intentá de nuevo.");
    }
  }

  let createdNow = false;
  let doc;
  try {
    doc = await withIdempotentCreate({
      findExisting,
      payloadsMatch,
      create: async () => {
        const row = await prisma.$transaction(async (tx) => {
          await lockDocumentUploadProject(tx, plan.anchorProjectId, plan.companyId, ctx);
          const row = await tx.documentAttachment.create({
            data: {
              id:               plan.id,
              tenantId:         ctx.tenantId,
              companyId:        plan.companyId,
              projectId:        plan.anchorProjectId,
              folderId,
              originalFileName: input.originalFileName,
              fileName:         plan.fileName,
              mimeType,
              sizeBytes:        input.sizeBytes,
              storageProvider:  provider,
              storageKey:       plan.storageKey,
              category:         input.category ?? "OTHER",
              description:      input.description ?? null,
              status:           "ACTIVE",
              linkedEntityType: plan.linkedEntityType,
              linkedEntityId:   plan.linkedEntityId,
              contentSha256,
              idempotencyKey,
              uploadedBy:       ctx.actorUserId,
            },
          });
          await log({
            tenantId: ctx.tenantId,
            actorUserId: ctx.actorUserId,
            action: "document.uploaded",
            entityType: "DocumentAttachment",
            entityId: row.id,
            projectId: row.projectId,
            companyId: row.companyId,
            after: { originalFileName: row.originalFileName, storageProvider: row.storageProvider, status: row.status },
          }, tx);
          return row;
        });
        createdNow = true;
        return row;
      },
    });
  } catch (err) {
    if (configured) {
      // After a transport failure the insert may have committed. Delete only
      // when a fresh DB read proves this attempt has no attachment row.
      const persisted = await prisma.documentAttachment.findFirst({
        where: { id: plan.id, tenantId: ctx.tenantId }, select: { id: true },
      }).catch(() => undefined);
      if (persisted === null) await deleteObject(plan.storageKey).catch(() => undefined);
    }
    throw err;
  }

  if (configured && !createdNow) {
    await deleteObject(plan.storageKey).catch(() => undefined);
  }

  if (createdNow) await notifyDocumentUploadConfirmed(doc, ctx).catch(() => undefined);

  return { documentId: doc.id, storageConfigured: doc.storageProvider === "R2" };
}

function uploadIntentMatches(
  row: DocumentAttachment,
  input: InitiateUploadInput,
  plan: DocumentUploadPlan,
  folderId: string | null,
  ctx: ServiceContext,
): boolean {
  return row.uploadedBy === ctx.actorUserId && row.projectId === plan.anchorProjectId &&
    // Older rows may have inherited their company only through the parent.
    (row.companyId === null || row.companyId === plan.companyId) &&
    row.folderId === folderId && row.originalFileName === input.originalFileName &&
    row.mimeType === input.mimeType && row.sizeBytes === input.sizeBytes &&
    row.category === (input.category ?? "OTHER") && row.description === (input.description ?? null) &&
    row.linkedEntityType === plan.linkedEntityType && row.linkedEntityId === plan.linkedEntityId;
}

async function uploadResponse(doc: DocumentAttachment, configured: boolean, created: boolean, ctx: ServiceContext) {
  await requireDocumentLinkAccess(doc, ctx);
  let uploadUrl: string | null = null;
  if (configured && doc.status === "UPLOADING" && doc.storageProvider === "R2") {
    assertDocumentStorageObject(doc);
    uploadUrl = await getPresignedPutUrl(doc.storageKey, doc.mimeType, doc.sizeBytes, 300);
  }
  return {
    documentId: doc.id,
    uploadUrl,
    storageConfigured: doc.storageProvider === "R2",
    status: doc.status as "UPLOADING" | "ACTIVE",
    created,
  };
}

/**
 * Direct-to-R2 upload (browser PUT). Avoids Vercel’s 4.5 MB function body limit.
 * When R2 is not configured, creates ACTIVE PLACEHOLDER metadata (no uploadUrl).
 */
export async function initiateDocumentUpload(
  input: InitiateUploadInput,
  ctx: ServiceContext,
): Promise<{
  documentId: string;
  uploadUrl: string | null;
  storageConfigured: boolean;
  status: "UPLOADING" | "ACTIVE";
  created: boolean;
}> {
  const configured = isStorageConfigured();
  const idempotencyKey = requireIdempotencyKey(input.idempotencyKey);
  const mimeType = canonicalizeDeclaredUploadMime(input.originalFileName, input.mimeType);

  if (!Number.isSafeInteger(input.sizeBytes) || input.sizeBytes <= 0) {
    throw new ServiceError("VALIDATION", "El archivo está vacío");
  }
  if (input.sizeBytes > MAX_SIZE_BYTES) {
    throw new ServiceError("VALIDATION", "El archivo no puede superar 50 MB");
  }

  const plan = await resolveDocumentUploadPlan({ ...input, mimeType }, ctx);
  const folderId = await resolveFolderIdForUpload({
    projectId: plan.anchorProjectId,
    linkedEntityType: plan.linkedEntityType,
    requestedFolderId: input.folderId,
    ctx,
  });
  const provider = configured ? "R2" : "PLACEHOLDER";
  const status = configured ? "UPLOADING" : "ACTIVE";

  const findExisting = () =>
    prisma.documentAttachment.findFirst({
      where: { tenantId: ctx.tenantId, idempotencyKey },
    });

  const payloadsMatch = (existing: DocumentAttachment) =>
    (existing.status === "UPLOADING" || existing.status === "ACTIVE") &&
    uploadIntentMatches(existing, { ...input, mimeType }, plan, folderId, ctx);

  const existing = await findExisting();
  if (existing) {
    if (!payloadsMatch(existing)) {
      throw new ServiceError(
        "CONFLICT",
        "Esta operación ya se registró con datos distintos. Recargá e intentá de nuevo.",
      );
    }
    return uploadResponse(existing, configured, false, ctx);
  }

  let createdNow = false;
  const doc = await withIdempotentCreate({
    findExisting,
    payloadsMatch,
    create: async () => {
      const row = await prisma.$transaction(async (tx) => {
        await lockDocumentUploadProject(tx, plan.anchorProjectId, plan.companyId, ctx);
        const row = await tx.documentAttachment.create({
          data: {
            id: plan.id,
            tenantId: ctx.tenantId,
            companyId: plan.companyId,
            projectId: plan.anchorProjectId,
            folderId,
            originalFileName: input.originalFileName,
            fileName: plan.fileName,
            mimeType,
            sizeBytes: input.sizeBytes,
            storageProvider: provider,
            storageKey: plan.storageKey,
            category: input.category ?? "OTHER",
            description: input.description ?? null,
            status,
            linkedEntityType: plan.linkedEntityType,
            linkedEntityId: plan.linkedEntityId,
            idempotencyKey,
            uploadedBy: ctx.actorUserId,
          },
        });
        await log({
          tenantId: ctx.tenantId,
          actorUserId: ctx.actorUserId,
          action: "document.upload_initiated",
          entityType: "DocumentAttachment",
          entityId: row.id,
          projectId: row.projectId,
          companyId: row.companyId,
          after: { originalFileName: row.originalFileName, storageProvider: row.storageProvider, status: row.status },
        }, tx);
        return row;
      });
      createdNow = true;
      return row;
    },
  });

  if (createdNow && !configured) await notifyDocumentUploadConfirmed(doc, ctx).catch(() => undefined);

  return uploadResponse(doc, configured, createdNow, ctx);
}

export async function confirmDocumentUpload(
  id: string,
  ctx: ServiceContext,
): Promise<DocumentRouteTarget> {
  const doc = await prisma.documentAttachment.findUnique({ where: { id } });
  if (!doc || doc.tenantId !== ctx.tenantId) {
    throw new ServiceError("NOT_FOUND", "Documento no encontrado");
  }
  const gate = await getTenantModuleGate(ctx);
  assertLinkedEntityTenantModuleEnabled(gate, doc.linkedEntityType);
  if (!canMutateDocumentByLink(doc.linkedEntityType, ctx.roles, doc.projectId)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para confirmar subida");
  }
  const companyId = await requireDocumentLinkAccess(doc, ctx);
  if (doc.status === "ACTIVE" && doc.storageProvider === "R2") {
    return resolveDocumentRouteTarget(doc);
  }
  if (doc.status !== "UPLOADING") {
    throw new ServiceError("CONFLICT", "El documento no está en estado UPLOADING");
  }
  if (doc.storageProvider !== "R2") {
    throw new ServiceError("CONFLICT", "Solo se confirman subidas al almacenamiento R2");
  }

  assertDocumentStorageObject(doc);

  let contentLength: number | undefined;
  try {
    const head = await headObject(doc.storageKey);
    contentLength = head.contentLength;
  } catch {
    throw new ServiceError(
      "VALIDATION",
      "No encontramos el archivo en el almacenamiento. Subilo de nuevo.",
    );
  }

  if (contentLength == null || contentLength <= 0 || contentLength > MAX_SIZE_BYTES || contentLength !== doc.sizeBytes) {
    await replaceRejectedUploadObject(doc);
    throw new ServiceError(
      "VALIDATION",
      "El tamaño del archivo subido no coincide. Intentá de nuevo.",
    );
  }

  const sniffEnd = Math.min(contentLength, CONFIRM_SNIFF_MAX_BYTES) - 1;
  let prefix: Buffer;
  try {
    prefix = await getObjectByteRange(doc.storageKey, 0, sniffEnd);
  } catch {
    throw new ServiceError("VALIDATION", "No se pudo verificar el archivo en el almacenamiento. Intentá de nuevo.");
  }
  try {
    await assertUploadContentMatchesDeclaredMime(prefix, doc.mimeType);
  } catch (err) {
    if (err instanceof ServiceError) {
      await replaceRejectedUploadObject(doc);
      throw err;
    }
    throw new ServiceError("VALIDATION", "No se pudo verificar el archivo en el almacenamiento. Intentá de nuevo.");
  }

  // Atomic transition: only one concurrent confirm wins and notifies.
  const activated = await prisma.$transaction(async (tx) => {
    await lockDocumentUploadProject(tx, doc.projectId, companyId, ctx);
    const result = await tx.documentAttachment.updateMany({
      where: {
        id,
        tenantId: ctx.tenantId,
        status: "UPLOADING",
        storageProvider: "R2",
        storageKey: doc.storageKey,
      },
      data: { status: "ACTIVE" },
    });
    if (result.count === 1) {
      await log({
        tenantId: ctx.tenantId,
        actorUserId: ctx.actorUserId,
        action: "document.upload_confirmed",
        entityType: "DocumentAttachment",
        entityId: id,
        projectId: doc.projectId,
        companyId,
        before: { status: "UPLOADING" },
        after: { status: "ACTIVE" },
      }, tx);
    }
    return result;
  });
  if (activated.count === 0) {
    const again = await prisma.documentAttachment.findUnique({ where: { id } });
    if (again?.tenantId === ctx.tenantId && again.status === "ACTIVE" && again.storageKey === doc.storageKey) {
      return resolveDocumentRouteTarget(again);
    }
    throw new ServiceError("CONFLICT", "El documento no está en estado UPLOADING");
  }

  await notifyDocumentUploadConfirmed(doc, ctx).catch(() => undefined);
  return resolveDocumentRouteTarget(doc);
}

type DocumentRouteTarget = Pick<DocumentAttachmentView, "id" | "projectId" | "linkedEntityType" | "linkedEntityId" | "relatedEntityId">;

async function resolveDocumentRouteTarget(doc: DocumentAttachment): Promise<DocumentRouteTarget> {
  const { id, projectId, linkedEntityType, linkedEntityId } = doc;
  const target: DocumentRouteTarget = { id, projectId, linkedEntityType, linkedEntityId };
  if (!linkedEntityId) return target;
  if (linkedEntityType === "SUBCONTRACT_CERTIFICATION" && projectId) {
    const parent = await prisma.subcontractCertification.findFirst({
      where: { id: linkedEntityId, tenantId: doc.tenantId, projectId }, select: { subcontractId: true },
    });
    if (parent) target.relatedEntityId = parent.subcontractId;
  } else if (linkedEntityType === "PROCUREMENT_QUOTE" && projectId) {
    const parent = await prisma.procurementQuote.findFirst({
      where: { id: linkedEntityId, tenantId: doc.tenantId, purchaseRequest: { tenantId: doc.tenantId, projectId } },
      select: { purchaseRequestId: true },
    });
    if (parent) target.relatedEntityId = parent.purchaseRequestId;
  } else if (linkedEntityType === "SALES_INVOICE" && projectId === null) {
    const receivable = await prisma.receivable.findFirst({
      where: { salesInvoiceId: linkedEntityId, tenantId: doc.tenantId, projectId: null, ...(doc.companyId ? { companyId: doc.companyId } : {}) },
      select: { id: true },
    });
    if (receivable) target.relatedEntityId = receivable.id;
  }
  return target;
}

/** Advance the pending attempt before deleting its rejected object. A different
 * confirm can only activate the key it checked, and only one rejection wins. */
async function replaceRejectedUploadObject(doc: DocumentAttachment): Promise<void> {
  const replaced = await prisma.documentAttachment.updateMany({
    where: { id: doc.id, tenantId: doc.tenantId, status: "UPLOADING", storageKey: doc.storageKey },
    data: { storageKey: buildStorageKey(doc.tenantId, doc.projectId, crypto.randomUUID(), doc.originalFileName) },
  });
  if (replaced.count === 1) await deleteObject(doc.storageKey).catch(() => undefined);
}

function assertDocumentStorageObject(doc: Pick<DocumentAttachment, "tenantId" | "projectId" | "storageKey">): void {
  const [tenant, project, object, file, ...rest] = doc.storageKey.split("/");
  if (tenant !== doc.tenantId || project !== (doc.projectId ?? "global") || !object || !file || rest.length > 0) {
    throw new ServiceError("NOT_FOUND", "Documento no encontrado");
  }
}

export async function getDocumentDownloadUrl(
  id: string,
  ctx: ServiceContext,
  options: { disposition?: ContentDispositionKind } = {},
): Promise<string> {
  const doc = await prisma.documentAttachment.findUnique({ where: { id } });
  if (!doc || doc.tenantId !== ctx.tenantId) throw new ServiceError("NOT_FOUND", "Documento no encontrado");
  if (!canViewDocumentByLink(doc.linkedEntityType, ctx.roles, doc.projectId)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para descargar documentos");
  }
  await requireDocumentLinkAccess(doc, ctx);
  if (doc.status === "DELETED") throw new ServiceError("FORBIDDEN", "El documento ha sido eliminado");
  if (doc.status === "UPLOADING") throw new ServiceError("CONFLICT", "El documento todavía se está subiendo");
  if (doc.storageProvider !== "R2") {
    throw new ServiceError(
      "CONFLICT",
      "No hay archivo almacenado para descargar. Solo se guardó la metadata del documento (el almacenamiento de archivos no estaba configurado).",
    );
  }

  // Never force-inline CAD/Office/etc. even if the client asks for disposition=inline.
  let disposition: ContentDispositionKind = options.disposition ?? "attachment";
  if (disposition === "inline" && !isInlineDocumentPreviewMime(doc.mimeType)) {
    disposition = "attachment";
  }

  assertDocumentStorageObject(doc);
  return getPresignedGetUrl(doc.storageKey, {
    expiresInSeconds: 300,
    responseContentDisposition: buildContentDispositionHeader(disposition, doc.originalFileName),
    responseContentType: doc.mimeType || undefined,
  });
}

export type DocumentFileBytes = {
  body: Buffer;
  mimeType: string;
  originalFileName: string;
  sizeBytes: number;
};

/** Server-side R2 read for PDF embedding (same auth as download). */
export async function getDocumentFileBytes(
  id: string,
  ctx: ServiceContext,
): Promise<DocumentFileBytes> {
  const doc = await prisma.documentAttachment.findUnique({ where: { id } });
  if (!doc || doc.tenantId !== ctx.tenantId) throw new ServiceError("NOT_FOUND", "Documento no encontrado");
  if (!canViewDocumentByLink(doc.linkedEntityType, ctx.roles, doc.projectId)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para descargar documentos");
  }
  await requireDocumentLinkAccess(doc, ctx);
  if (doc.status === "DELETED") throw new ServiceError("FORBIDDEN", "El documento ha sido eliminado");
  if (doc.status === "UPLOADING") throw new ServiceError("CONFLICT", "El documento todavía se está subiendo");
  if (doc.storageProvider !== "R2") {
    throw new ServiceError(
      "CONFLICT",
      "No hay archivo almacenado para descargar. Solo se guardó la metadata del documento (el almacenamiento de archivos no estaba configurado).",
    );
  }

  assertDocumentStorageObject(doc);

  const { body } = await getObjectBytes(doc.storageKey);
  if (body.length !== doc.sizeBytes || body.length > MAX_SIZE_BYTES) {
    throw new ServiceError("CONFLICT", "El tamaño del archivo almacenado no coincide");
  }
  return {
    body,
    mimeType: doc.mimeType,
    originalFileName: doc.originalFileName,
    sizeBytes: doc.sizeBytes,
  };
}

async function changeDocumentStatus(
  doc: DocumentAttachment,
  status: "ACTIVE" | "ARCHIVED" | "DELETED",
  action: "document.reactivated" | "document.archived" | "document.deleted",
  ctx: ServiceContext,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const flipped = await tx.documentAttachment.updateMany({
      where: { id: doc.id, tenantId: ctx.tenantId, status: doc.status },
      data: { status },
    });
    assertOptimisticRowUpdate(flipped.count, "El documento ya fue modificado. Recargá e intentá de nuevo.");
    await log({
      tenantId: ctx.tenantId,
      actorUserId: ctx.actorUserId,
      action,
      entityType: "DocumentAttachment",
      entityId: doc.id,
      projectId: doc.projectId,
      companyId: doc.companyId,
      before: { status: doc.status },
      after: { status },
    }, tx);
  });
}

export async function archiveDocument(id: string, ctx: ServiceContext): Promise<void> {
  const doc = await getOwned(id, ctx, await getTenantModuleGate(ctx));
  if (doc.status !== "ACTIVE") throw new ServiceError("CONFLICT", "Solo se pueden archivar documentos activos");
  await changeDocumentStatus(doc, "ARCHIVED", "document.archived", ctx);
}

export async function restoreDocument(id: string, ctx: ServiceContext): Promise<void> {
  const doc = await getOwned(id, ctx, await getTenantModuleGate(ctx));
  if (doc.status !== "ARCHIVED") throw new ServiceError("CONFLICT", "Solo se pueden restaurar documentos archivados");
  await changeDocumentStatus(doc, "ACTIVE", "document.reactivated", ctx);
}

export async function softDeleteDocument(id: string, ctx: ServiceContext): Promise<void> {
  const doc = await getOwned(id, ctx, await getTenantModuleGate(ctx));
  if (doc.status === "DELETED") throw new ServiceError("CONFLICT", "El documento ya está eliminado");
  if (!canSoftDeleteDocumentByLink({ status: doc.status, linkedEntityType: doc.linkedEntityType })) {
    throw new ServiceError("FORBIDDEN", LINKED_DOCUMENT_DELETE_BLOCKED_MESSAGE);
  }
  await changeDocumentStatus(doc, "DELETED", "document.deleted", ctx);
}

export async function getDocumentById(id: string, ctx: ServiceContext): Promise<DocumentAttachmentView> {
  const doc = await prisma.documentAttachment.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!doc || doc.status === "DELETED") throw new ServiceError("NOT_FOUND", "Documento no encontrado");
  if (!canViewDocumentByLink(doc.linkedEntityType, ctx.roles, doc.projectId)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver documentos");
  }
  await requireDocumentLinkAccess(doc, ctx);
  const route = await resolveDocumentRouteTarget(doc);
  return { ...serialize(doc, ctx, await getTenantModuleGate(ctx)), relatedEntityId: route.relatedEntityId };
}

export async function listProjectDocuments(
  projectId: string,
  filters: ListProjectDocumentsInput,
  ctx: ServiceContext,
): Promise<DocumentAttachmentView[]> {
  if (!can(ctx.roles, "VIEW", "PROJECTS")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver documentos");
  }
  const project = await requireProjectAccess(projectId, ctx);
  await backfillProjectDocumentFolders(projectId, ctx);

  if (filters.folderId) {
    await getFolderInProjectOrThrow(filters.folderId, projectId, ctx);
  }

  const docs = await prisma.documentAttachment.findMany({
    where: {
      tenantId: ctx.tenantId,
      projectId,
      status: filters.status ?? "ACTIVE",
      AND: [
        companyScopeFilter(ctx),
        { OR: [{ folderId: null }, { folder: { tenantId: ctx.tenantId, projectId } }] },
        ...(filters.search ? [{
          OR: [
            { originalFileName: { contains: filters.search, mode: "insensitive" as const } },
            { fileName: { contains: filters.search, mode: "insensitive" as const } },
            { description: { contains: filters.search, mode: "insensitive" as const } },
          ],
        }] : []),
      ],
      ...(filters.folderId ? { folderId: filters.folderId } : {}),
      ...(filters.category ? { category: filters.category } : {}),
    },
    orderBy: { createdAt: "desc" },
  });

  const visible = await filterProjectDocumentsByLink(docs, project, ctx);
  const gate = await getTenantModuleGate(ctx);
  return visible.map((doc) => serialize(doc, ctx, gate));
}

export async function listEntityDocuments(
  entityType: string,
  entityId: string,
  ctx: ServiceContext,
  options?: { projectId?: string },
): Promise<DocumentAttachmentView[]> {
  if (!isDocumentOperationalLink(entityType)) {
    throw new ServiceError("VALIDATION", "Tipo de entidad no soportado para adjuntos");
  }

  let parent = await requireDocumentParent(entityType, entityId, ctx);
  if (parent.projectId !== (options?.projectId ?? null)) {
    throw new ServiceError("FORBIDDEN", "La entidad del adjunto no pertenece al proyecto indicado");
  }
  if (!canViewDocumentByLink(entityType, ctx.roles, parent.projectId)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver adjuntos de esta entidad");
  }
  if (parent.projectId) {
    const project = await requireProjectAccess(parent.projectId, ctx);
    const scoped = documentScopeInProject(parent, project);
    if (!scoped) throw new ServiceError("NOT_FOUND", "Entidad del adjunto no encontrada");
    parent = scoped;
  }
  await assertDocumentCompanyInTenant(parent.companyId, ctx.tenantId);

  const docs = await prisma.documentAttachment.findMany({
    where: {
      tenantId: ctx.tenantId,
      linkedEntityType: entityType,
      linkedEntityId: entityId,
      projectId: parent.projectId,
      AND: [
        companyScopeFilter(ctx),
        parent.projectId
          ? { OR: [{ folderId: null }, { folder: { tenantId: ctx.tenantId, projectId: parent.projectId } }] }
          : { folderId: null },
        {
          OR: [
            { status: { in: ["ACTIVE", "ARCHIVED"] } },
            { status: "UPLOADING", createdAt: { gte: new Date(Date.now() - ABANDONED_UPLOAD_THRESHOLD_MS) } },
          ],
        },
      ],
    },
    orderBy: { createdAt: "desc" },
  });

  const companyIds = parent.companyId === null
    ? [...new Set(docs.flatMap((doc) => doc.companyId ? [doc.companyId] : []))]
    : [];
  const companyRows = companyIds.length === 0 ? [] : await prisma.company.findMany({
    where: { tenantId: ctx.tenantId, id: { in: companyIds } }, select: { id: true },
  });
  const validCompanies = new Set(companyRows.map(({ id }) => id));
  const gate = await getTenantModuleGate(ctx);
  return docs.filter((doc) => documentMatchesScope(doc, parent, ctx) &&
    (parent.companyId !== null || doc.companyId === null || validCompanies.has(doc.companyId)))
    .map((doc) => serialize(doc, ctx, gate));
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
  if (!Number.isFinite(olderThanMs) || olderThanMs < ABANDONED_UPLOAD_THRESHOLD_MS) {
    throw new ServiceError("VALIDATION", "La antigüedad de limpieza debe superar la ventana de subida");
  }
  const cutoff = new Date(Date.now() - olderThanMs);
  const pendingWhere = {
    tenantId: ctx.tenantId, status: "UPLOADING" as const, createdAt: { lt: cutoff }, ...companyScopeFilter(ctx),
  };
  const candidates = await prisma.documentAttachment.findMany({ where: pendingWhere });
  const documentIds: string[] = [];
  for (const doc of candidates) {
    try {
      await requireDocumentLinkAccess(doc, ctx);
      documentIds.push(doc.id);
    } catch (err) {
      if (!(err instanceof ServiceError && (err.code === "FORBIDDEN" || err.code === "NOT_FOUND"))) throw err;
    }
  }
  if (documentIds.length === 0) return { cleanedCount: 0, documentIds };

  const cleanedCount = await prisma.$transaction(async (tx) => {
    const updated = await tx.documentAttachment.updateMany({
      where: { ...pendingWhere, id: { in: documentIds } },
      data: { status: "DELETED" },
    });
    if (updated.count > 0) {
      await log({
        tenantId: ctx.tenantId,
        actorUserId: ctx.actorUserId,
        action: "document.stale_upload_batch_cleaned",
        entityType: "Tenant",
        entityId: ctx.tenantId,
        companyId: ctx.companyId,
        after: { cleanedCount: updated.count, documentIds, olderThanMs, cutoffIso: cutoff.toISOString() },
      }, tx);
    }
    return updated.count;
  });
  return { cleanedCount, documentIds };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sanitize(filename: string): string {
  const safe = filename
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_{2,}/g, "_")
    .toLowerCase();
  return !safe || safe === "." || safe === ".." ? "file" : safe;
}

async function getOwned(id: string, ctx: ServiceContext, gate: TenantModuleGate) {
  const doc = await prisma.documentAttachment.findUnique({ where: { id } });
  if (!doc || doc.tenantId !== ctx.tenantId) throw new ServiceError("NOT_FOUND", "Documento no encontrado");
  assertLinkedEntityTenantModuleEnabled(gate, doc.linkedEntityType);
  if (!canMutateDocumentByLink(doc.linkedEntityType, ctx.roles, doc.projectId)) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para modificar documentos");
  }
  const companyId = await requireDocumentLinkAccess(doc, ctx);
  return { ...doc, companyId };
}

function linkedEntityTypeToPermissionModule(linkedEntityType: string | null): PermissionModule {
  const t = linkedEntityType ?? "PROJECT";
  if (t === "PROJECT") return "PROJECTS";
  if (t === "JOBSITE_LOG") return "JOBSITE_LOG";
  if (t === "CERTIFICATION") return "CERTIFICATIONS";
  if (t === "SUPPLIER_INVOICE") return "AP";
  if (t === "SALES_INVOICE") return "AR";
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
    folderId?: string | null;
    originalFileName: string; fileName: string; mimeType: string; sizeBytes: number;
    storageProvider: string; category: string; description: string | null;
    status: string; linkedEntityType: LinkedEntityType | null; linkedEntityId: string | null;
    uploadedBy: string; createdAt: Date; updatedAt: Date;
  },
  ctx: ServiceContext,
  gate: TenantModuleGate,
): DocumentAttachmentView {
  const mod = linkedEntityTypeToPermissionModule(doc.linkedEntityType);
  const moduleDisabled = !gate.isEnabled(mod);
  const canMutate = canMutateDocumentByLink(doc.linkedEntityType, ctx.roles, doc.projectId) && !moduleDisabled;
  return {
    id:               doc.id,
    tenantId:         doc.tenantId,
    companyId:        doc.companyId,
    projectId:        doc.projectId,
    folderId:         doc.folderId ?? null,
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
    canMutate,
    canDelete:
      canMutate &&
      canSoftDeleteDocumentByLink({
        status: doc.status,
        linkedEntityType: doc.linkedEntityType,
      }),
    ...(moduleDisabled ? { disabledLinkedModule: mod } : {}),
  };
}
