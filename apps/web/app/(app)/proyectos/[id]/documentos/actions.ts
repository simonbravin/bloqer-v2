"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import {
  archiveDocument,
  createDocumentFolder,
  deleteDocumentFolder,
  getDocumentById,
  moveLibraryDocumentToFolder,
  renameDocumentFolder,
  restoreDocument,
  softDeleteDocument,
  ServiceError,
  type DocumentAttachmentView,
  type DocumentFolderView,
} from "@bloqer/services";
import {
  createDocumentFolderSchema,
  moveLibraryDocumentSchema,
  renameDocumentFolderSchema,
} from "@bloqer/validators";
import { documentRevalidatePaths } from "@/features/documents/lib/document-revalidate-paths";
import { rethrowNextNavigationError } from "@/lib/next-errors";

function getCtx(current: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>) {
  return {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx!.tenantId,
    companyId: current.tenantCtx!.companyId,
    roles: current.tenantCtx!.roles,
  };
}

function rethrowActionError(err: unknown): never {
  rethrowNextNavigationError(err);
  if (err instanceof ServiceError) throw new Error(err.message);
  throw err instanceof Error ? err : new Error("Error inesperado");
}

async function loadDocumentInProject(
  documentId: string,
  projectId: string,
  ctx: ReturnType<typeof getCtx>,
): Promise<DocumentAttachmentView> {
  const doc = await getDocumentById(documentId, ctx);
  if (doc.projectId !== projectId) {
    throw new ServiceError("FORBIDDEN", "El documento no pertenece a este proyecto");
  }
  return doc;
}

function revalidateDocumentSurfaces(
  doc: DocumentAttachmentView,
  projectId: string,
  extraPathsToRevalidate?: string[],
): void {
  const paths = new Set([
    ...documentRevalidatePaths({
      projectId,
      documentId: doc.id,
      linkedEntityType: doc.linkedEntityType,
      linkedEntityId: doc.linkedEntityId,
    }),
    ...(extraPathsToRevalidate ?? []),
  ]);
  for (const p of paths) revalidatePath(p);
}

function revalidateProjectDocuments(projectId: string): void {
  revalidatePath(`/proyectos/${projectId}/documentos`);
}

export async function archiveDocumentAction(
  id: string,
  projectId: string,
  extraPathsToRevalidate?: string[],
): Promise<void> {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");
  const ctx = getCtx(current);
  try {
    const doc = await loadDocumentInProject(id, projectId, ctx);
    await archiveDocument(id, ctx);
    revalidateDocumentSurfaces(doc, projectId, extraPathsToRevalidate);
  } catch (err) {
    rethrowActionError(err);
  }
}

export async function restoreDocumentAction(
  id: string,
  projectId: string,
  extraPathsToRevalidate?: string[],
): Promise<void> {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");
  const ctx = getCtx(current);
  try {
    const doc = await loadDocumentInProject(id, projectId, ctx);
    await restoreDocument(id, ctx);
    revalidateDocumentSurfaces(doc, projectId, extraPathsToRevalidate);
  } catch (err) {
    rethrowActionError(err);
  }
}

export async function softDeleteDocumentAction(
  id: string,
  projectId: string,
  options?: { extraPathsToRevalidate?: string[]; redirectToProjectDocuments?: boolean },
): Promise<void> {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");
  const ctx = getCtx(current);
  try {
    const doc = await loadDocumentInProject(id, projectId, ctx);
    await softDeleteDocument(id, ctx);
    revalidateDocumentSurfaces(doc, projectId, options?.extraPathsToRevalidate);
  } catch (err) {
    rethrowActionError(err);
  }
  if (options?.redirectToProjectDocuments) {
    redirect(`/proyectos/${projectId}/documentos`);
  }
}

export async function createDocumentFolderAction(
  projectId: string,
  raw: { parentId: string; name: string },
): Promise<DocumentFolderView> {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");
  const parsed = createDocumentFolderSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(parsed.error.errors.map((e) => e.message).join(", "));
  }
  try {
    const folder = await createDocumentFolder(projectId, parsed.data, getCtx(current));
    revalidateProjectDocuments(projectId);
    return folder;
  } catch (err) {
    rethrowActionError(err);
  }
}

export async function renameDocumentFolderAction(
  projectId: string,
  folderId: string,
  raw: { name: string },
): Promise<DocumentFolderView> {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");
  const parsed = renameDocumentFolderSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(parsed.error.errors.map((e) => e.message).join(", "));
  }
  try {
    const folder = await renameDocumentFolder(projectId, folderId, parsed.data, getCtx(current));
    revalidateProjectDocuments(projectId);
    return folder;
  } catch (err) {
    rethrowActionError(err);
  }
}

export async function deleteDocumentFolderAction(
  projectId: string,
  folderId: string,
): Promise<void> {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");
  try {
    await deleteDocumentFolder(projectId, folderId, getCtx(current));
    revalidateProjectDocuments(projectId);
  } catch (err) {
    rethrowActionError(err);
  }
}

export async function moveLibraryDocumentAction(
  projectId: string,
  documentId: string,
  raw: { folderId: string },
): Promise<void> {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");
  const parsed = moveLibraryDocumentSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(parsed.error.errors.map((e) => e.message).join(", "));
  }
  try {
    await loadDocumentInProject(documentId, projectId, getCtx(current));
    await moveLibraryDocumentToFolder(documentId, projectId, parsed.data.folderId, getCtx(current));
    revalidateProjectDocuments(projectId);
  } catch (err) {
    rethrowActionError(err);
  }
}
