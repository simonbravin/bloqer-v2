import { randomUUID } from "node:crypto";
import { prisma } from "@bloqer/database";
import type { DocumentFolder, DocumentFolderSystemKey, Prisma } from "@bloqer/database";
import {
  DOCUMENT_FOLDER_MAX_DEPTH,
  DOCUMENT_FOLDER_SYSTEM_SEED,
  canCreateUserFolderUnder,
  can,
  folderDepth,
  isLibraryFolderDestination,
  isOperationalLinkedEntity,
  resolveSystemKeyForLinkedEntity,
  wouldCreateFolderCycle,
  type FolderTreeNode,
} from "@bloqer/domain";
import type {
  CreateDocumentFolderInput,
  MoveDocumentFolderInput,
  RenameDocumentFolderInput,
} from "@bloqer/validators";
import { ServiceContext, ServiceError } from "../types";
import { log } from "../audit/audit.service";
import { requireProjectAccess } from "../security/access";

export type DocumentFolderView = {
  id: string;
  tenantId: string;
  projectId: string;
  parentId: string | null;
  name: string;
  kind: "SYSTEM" | "USER";
  systemKey: DocumentFolderSystemKey | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  /** Library upload / USER children allowed under this folder. */
  allowsLibraryWrites: boolean;
  canRename: boolean;
  canDelete: boolean;
  canCreateChild: boolean;
};

function toTreeNode(row: {
  id: string;
  parentId: string | null;
  kind: string;
  systemKey: string | null;
}): FolderTreeNode {
  return {
    id: row.id,
    parentId: row.parentId,
    kind: row.kind,
    systemKey: row.systemKey,
  };
}

function serializeFolder(
  row: DocumentFolder,
  byId: Map<string, FolderTreeNode>,
): DocumentFolderView {
  const allowsLibraryWrites = isLibraryFolderDestination(row.id, byId);
  const isUser = row.kind === "USER";
  return {
    id: row.id,
    tenantId: row.tenantId,
    projectId: row.projectId,
    parentId: row.parentId,
    name: row.name,
    kind: row.kind,
    systemKey: row.systemKey,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    allowsLibraryWrites,
    canRename: isUser,
    canDelete: isUser,
    canCreateChild: allowsLibraryWrites,
  };
}

async function loadProjectFolderRows(
  tenantId: string,
  projectId: string,
): Promise<DocumentFolder[]> {
  return prisma.documentFolder.findMany({
    where: { tenantId, projectId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

function buildFolderMap(rows: DocumentFolder[]): Map<string, FolderTreeNode> {
  return new Map(rows.map((r) => [r.id, toTreeNode(r)]));
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "P2002"
  );
}

/**
 * Idempotent SYSTEM folder seed for a project ([D-113]). Race-safe via unique systemKey.
 */
export async function ensureProjectDocumentFolders(
  projectId: string,
  ctx: ServiceContext,
): Promise<DocumentFolder[]> {
  await requireProjectAccess(projectId, ctx);

  const project = await prisma.project.findFirst({
    where: { id: projectId, tenantId: ctx.tenantId },
    select: { id: true },
  });
  if (!project) {
    throw new ServiceError("NOT_FOUND", "Proyecto no encontrado");
  }

  const existing = await loadProjectFolderRows(ctx.tenantId, projectId);
  const haveKeys = new Set(
    existing.filter((f) => f.systemKey != null).map((f) => f.systemKey as string),
  );
  const missing = DOCUMENT_FOLDER_SYSTEM_SEED.filter((s) => !haveKeys.has(s.systemKey));
  if (missing.length === 0) return existing;

  for (const seed of missing) {
    try {
      await prisma.documentFolder.create({
        data: {
          id: randomUUID(),
          tenantId: ctx.tenantId,
          projectId,
          parentId: null,
          name: seed.name,
          kind: "SYSTEM",
          systemKey: seed.systemKey,
          sortOrder: seed.sortOrder,
          createdBy: ctx.actorUserId,
        },
      });
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
    }
  }

  return loadProjectFolderRows(ctx.tenantId, projectId);
}

/**
 * Assign folderId for docs in this project that still have null (lazy backfill).
 */
export async function backfillProjectDocumentFolders(
  projectId: string,
  ctx: ServiceContext,
): Promise<number> {
  const folders = await ensureProjectDocumentFolders(projectId, ctx);
  const byKey = new Map(
    folders
      .filter((f) => f.kind === "SYSTEM" && f.systemKey)
      .map((f) => [f.systemKey as string, f.id]),
  );
  const generalId = byKey.get("GENERAL");
  if (!generalId) return 0;

  const pending = await prisma.documentAttachment.findMany({
    where: {
      tenantId: ctx.tenantId,
      projectId,
      folderId: null,
      status: { not: "DELETED" },
    },
    select: { id: true, linkedEntityType: true },
  });
  if (pending.length === 0) return 0;

  const groups = new Map<string, string[]>();
  for (const doc of pending) {
    const key = resolveSystemKeyForLinkedEntity(doc.linkedEntityType);
    const folderId = byKey.get(key);
    // If SYSTEM seed is incomplete, leave null for a later retry (do not dump into GENERAL).
    if (!folderId) continue;
    const list = groups.get(folderId) ?? [];
    list.push(doc.id);
    groups.set(folderId, list);
  }

  let updated = 0;
  for (const [folderId, ids] of groups) {
    const result = await prisma.documentAttachment.updateMany({
      where: {
        tenantId: ctx.tenantId,
        projectId,
        folderId: null,
        id: { in: ids },
      },
      data: { folderId },
    });
    updated += result.count;
  }
  return updated;
}

export async function listProjectDocumentFolders(
  projectId: string,
  ctx: ServiceContext,
): Promise<DocumentFolderView[]> {
  if (!can(ctx.roles, "VIEW", "PROJECTS")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para ver documentos");
  }
  // Seed only here; backfill runs in listProjectDocuments / upload to avoid double work on the page.
  const rows = await ensureProjectDocumentFolders(projectId, ctx);
  const byId = buildFolderMap(rows);
  return rows.map((r) => serializeFolder(r, byId));
}

async function requireEditProjects(ctx: ServiceContext): Promise<void> {
  if (!can(ctx.roles, "EDIT", "PROJECTS")) {
    throw new ServiceError("FORBIDDEN", "Sin permisos para editar carpetas de documentos");
  }
}

export async function getFolderInProjectOrThrow(
  folderId: string,
  projectId: string,
  ctx: ServiceContext,
): Promise<DocumentFolder> {
  const folder = await prisma.documentFolder.findFirst({
    where: { id: folderId, tenantId: ctx.tenantId, projectId },
  });
  if (!folder) {
    throw new ServiceError("FORBIDDEN", "Carpeta no válida para este proyecto");
  }
  return folder;
}

/**
 * Resolve folderId for an upload. Operational links force SYSTEM folder; library validates allowlist.
 * Returns null when projectId is absent (corporate attachments).
 */
export async function resolveFolderIdForUpload(params: {
  projectId: string | null;
  linkedEntityType: string | null;
  requestedFolderId?: string | null;
  ctx: ServiceContext;
}): Promise<string | null> {
  const { projectId, linkedEntityType, requestedFolderId, ctx } = params;
  if (!projectId) return null;

  const folders = await ensureProjectDocumentFolders(projectId, ctx);
  const byId = buildFolderMap(folders);
  const byKey = new Map(
    folders
      .filter((f) => f.kind === "SYSTEM" && f.systemKey)
      .map((f) => [f.systemKey as string, f.id]),
  );

  if (isOperationalLinkedEntity(linkedEntityType)) {
    const key = resolveSystemKeyForLinkedEntity(linkedEntityType);
    const folderId = byKey.get(key);
    // Never fall back to GENERAL for operational links — that would misfile evidence/OC/invoices.
    if (!folderId) {
      throw new ServiceError(
        "VALIDATION",
        "No se pudo resolver la carpeta de sistema para este adjunto. Recargá e intentá de nuevo.",
      );
    }
    return folderId;
  }

  // Library (PROJECT / null treated as library at create time with PROJECT link)
  if (requestedFolderId) {
    await getFolderInProjectOrThrow(requestedFolderId, projectId, ctx);
    if (!isLibraryFolderDestination(requestedFolderId, byId)) {
      throw new ServiceError(
        "VALIDATION",
        "Solo podés subir a Planos, General o subcarpetas de esas carpetas",
      );
    }
    return requestedFolderId;
  }

  const generalId = byKey.get("GENERAL");
  if (!generalId) {
    throw new ServiceError("VALIDATION", "Carpeta General no disponible");
  }
  return generalId;
}

export async function createDocumentFolder(
  projectId: string,
  input: CreateDocumentFolderInput,
  ctx: ServiceContext,
): Promise<DocumentFolderView> {
  await requireEditProjects(ctx);
  await requireProjectAccess(projectId, ctx);

  const folders = await ensureProjectDocumentFolders(projectId, ctx);
  const byId = buildFolderMap(folders);

  await getFolderInProjectOrThrow(input.parentId, projectId, ctx);
  if (!canCreateUserFolderUnder(input.parentId, byId)) {
    throw new ServiceError(
      "VALIDATION",
      "Solo podés crear carpetas bajo Planos, General o sus subcarpetas",
    );
  }

  const parentDepth = folderDepth(input.parentId, byId);
  if (parentDepth >= DOCUMENT_FOLDER_MAX_DEPTH) {
    throw new ServiceError(
      "VALIDATION",
      `La profundidad máxima de carpetas es ${DOCUMENT_FOLDER_MAX_DEPTH}`,
    );
  }

  const name = input.name.trim();
  let created: DocumentFolder;
  try {
    created = await prisma.documentFolder.create({
      data: {
        id: randomUUID(),
        tenantId: ctx.tenantId,
        projectId,
        parentId: input.parentId,
        name,
        kind: "USER",
        systemKey: null,
        sortOrder: input.sortOrder ?? 0,
        createdBy: ctx.actorUserId,
      },
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new ServiceError("CONFLICT", "Ya existe una carpeta con ese nombre en este nivel");
    }
    throw err;
  }

  await log({
    tenantId: ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action: "document_folder.created",
    entityType: "DocumentFolder",
    entityId: created.id,
    projectId,
    after: { name: created.name, parentId: created.parentId },
  });

  const rows = await loadProjectFolderRows(ctx.tenantId, projectId);
  return serializeFolder(created, buildFolderMap(rows));
}

export async function renameDocumentFolder(
  projectId: string,
  folderId: string,
  input: RenameDocumentFolderInput,
  ctx: ServiceContext,
): Promise<DocumentFolderView> {
  await requireEditProjects(ctx);
  await requireProjectAccess(projectId, ctx);

  const folder = await getFolderInProjectOrThrow(folderId, projectId, ctx);
  if (folder.kind !== "USER") {
    throw new ServiceError("VALIDATION", "Las carpetas de sistema no se pueden renombrar");
  }

  const name = input.name.trim();
  try {
    const result = await prisma.documentFolder.updateMany({
      where: { id: folder.id, tenantId: ctx.tenantId, projectId },
      data: { name },
    });
    if (result.count !== 1) {
      throw new ServiceError("NOT_FOUND", "Carpeta no encontrada");
    }
  } catch (err) {
    if (err instanceof ServiceError) throw err;
    if (isUniqueViolation(err)) {
      throw new ServiceError("CONFLICT", "Ya existe una carpeta con ese nombre en este nivel");
    }
    throw err;
  }

  const updated = await getFolderInProjectOrThrow(folderId, projectId, ctx);

  await log({
    tenantId: ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action: "document_folder.renamed",
    entityType: "DocumentFolder",
    entityId: folder.id,
    projectId,
    before: { name: folder.name },
    after: { name: updated.name },
  });

  const rows = await loadProjectFolderRows(ctx.tenantId, projectId);
  return serializeFolder(updated, buildFolderMap(rows));
}

export async function moveDocumentFolder(
  projectId: string,
  folderId: string,
  input: MoveDocumentFolderInput,
  ctx: ServiceContext,
): Promise<DocumentFolderView> {
  await requireEditProjects(ctx);
  await requireProjectAccess(projectId, ctx);

  const folder = await getFolderInProjectOrThrow(folderId, projectId, ctx);
  if (folder.kind !== "USER") {
    throw new ServiceError("VALIDATION", "Las carpetas de sistema no se pueden mover");
  }

  const folders = await loadProjectFolderRows(ctx.tenantId, projectId);
  const byId = buildFolderMap(folders);

  await getFolderInProjectOrThrow(input.parentId, projectId, ctx);
  if (!canCreateUserFolderUnder(input.parentId, byId)) {
    throw new ServiceError(
      "VALIDATION",
      "Solo podés mover carpetas bajo Planos, General o sus subcarpetas",
    );
  }
  if (wouldCreateFolderCycle(folderId, input.parentId, byId)) {
    throw new ServiceError("VALIDATION", "No se puede mover una carpeta dentro de sí misma");
  }

  const newDepth = folderDepth(input.parentId, byId) + 1;
  // Also account for deepest descendant
  const descendantExtra = maxDescendantDepth(folderId, byId);
  if (newDepth + descendantExtra - 1 > DOCUMENT_FOLDER_MAX_DEPTH) {
    throw new ServiceError(
      "VALIDATION",
      `La profundidad máxima de carpetas es ${DOCUMENT_FOLDER_MAX_DEPTH}`,
    );
  }

  try {
    const result = await prisma.documentFolder.updateMany({
      where: { id: folder.id, tenantId: ctx.tenantId, projectId },
      data: { parentId: input.parentId },
    });
    if (result.count !== 1) {
      throw new ServiceError("NOT_FOUND", "Carpeta no encontrada");
    }
  } catch (err) {
    if (err instanceof ServiceError) throw err;
    if (isUniqueViolation(err)) {
      throw new ServiceError("CONFLICT", "Ya existe una carpeta con ese nombre en este nivel");
    }
    throw err;
  }

  const updated = await getFolderInProjectOrThrow(folderId, projectId, ctx);

  await log({
    tenantId: ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action: "document_folder.moved",
    entityType: "DocumentFolder",
    entityId: folder.id,
    projectId,
    before: { parentId: folder.parentId },
    after: { parentId: updated.parentId },
  });

  const rows = await loadProjectFolderRows(ctx.tenantId, projectId);
  return serializeFolder(updated, buildFolderMap(rows));
}

function maxDescendantDepth(
  folderId: string,
  byId: Map<string, FolderTreeNode>,
): number {
  let max = 1;
  const children = [...byId.values()].filter((n) => n.parentId === folderId);
  for (const child of children) {
    max = Math.max(max, 1 + maxDescendantDepth(child.id, byId));
  }
  return max;
}

export async function deleteDocumentFolder(
  projectId: string,
  folderId: string,
  ctx: ServiceContext,
): Promise<void> {
  await requireEditProjects(ctx);
  await requireProjectAccess(projectId, ctx);

  const folder = await getFolderInProjectOrThrow(folderId, projectId, ctx);
  if (folder.kind !== "USER") {
    throw new ServiceError("VALIDATION", "Las carpetas de sistema no se pueden eliminar");
  }

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const childCountTx = await tx.documentFolder.count({
      where: { tenantId: ctx.tenantId, projectId, parentId: folderId },
    });
    if (childCountTx > 0) {
      throw new ServiceError(
        "VALIDATION",
        "La carpeta tiene subcarpetas; borrá o mové primero las hijas",
      );
    }

    const blockingDocs = await tx.documentAttachment.count({
      where: {
        tenantId: ctx.tenantId,
        projectId,
        folderId,
        status: { in: ["ACTIVE", "ARCHIVED", "UPLOADING"] },
      },
    });
    if (blockingDocs > 0) {
      throw new ServiceError(
        "VALIDATION",
        "La carpeta tiene documentos; movelos o eliminalos de la biblioteca antes de borrarla",
      );
    }

    await tx.documentAttachment.updateMany({
      where: {
        tenantId: ctx.tenantId,
        projectId,
        folderId,
        status: "DELETED",
      },
      data: { folderId: null },
    });

    const deleted = await tx.documentFolder.deleteMany({
      where: { id: folderId, tenantId: ctx.tenantId, projectId, kind: "USER" },
    });
    if (deleted.count !== 1) {
      throw new ServiceError("NOT_FOUND", "Carpeta no encontrada");
    }
  });

  await log({
    tenantId: ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action: "document_folder.deleted",
    entityType: "DocumentFolder",
    entityId: folderId,
    projectId,
    before: { name: folder.name, parentId: folder.parentId },
  });
}

export async function moveLibraryDocumentToFolder(
  documentId: string,
  projectId: string,
  targetFolderId: string,
  ctx: ServiceContext,
): Promise<void> {
  await requireEditProjects(ctx);
  await requireProjectAccess(projectId, ctx);

  const doc = await prisma.documentAttachment.findFirst({
    where: { id: documentId, tenantId: ctx.tenantId, projectId },
  });
  if (!doc) {
    throw new ServiceError("NOT_FOUND", "Documento no encontrado");
  }
  if (isOperationalLinkedEntity(doc.linkedEntityType)) {
    throw new ServiceError(
      "VALIDATION",
      "Los adjuntos operativos no se pueden mover de su carpeta de sistema",
    );
  }
  if (doc.linkedEntityType !== "PROJECT" && doc.linkedEntityType != null) {
    throw new ServiceError("VALIDATION", "Solo se pueden mover documentos de la biblioteca");
  }

  const folders = await ensureProjectDocumentFolders(projectId, ctx);
  const byId = buildFolderMap(folders);
  await getFolderInProjectOrThrow(targetFolderId, projectId, ctx);
  if (!isLibraryFolderDestination(targetFolderId, byId)) {
    throw new ServiceError(
      "VALIDATION",
      "Solo podés mover a Planos, General o subcarpetas de esas carpetas",
    );
  }

  await prisma.documentAttachment.updateMany({
    where: { id: doc.id, tenantId: ctx.tenantId, projectId },
    data: { folderId: targetFolderId },
  });

  await log({
    tenantId: ctx.tenantId,
    actorUserId: ctx.actorUserId,
    action: "document.moved_folder",
    entityType: "DocumentAttachment",
    entityId: doc.id,
    projectId,
    before: { folderId: doc.folderId },
    after: { folderId: targetFolderId },
  });
}
