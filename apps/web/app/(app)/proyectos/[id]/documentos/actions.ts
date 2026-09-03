"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import {
  archiveDocument,
  getDocumentById,
  restoreDocument,
  softDeleteDocument,
  ServiceError,
  type DocumentAttachmentView,
} from "@bloqer/services";
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
