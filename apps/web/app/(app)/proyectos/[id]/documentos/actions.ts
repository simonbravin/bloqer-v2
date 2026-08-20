"use server";

import { revalidatePath } from "next/cache";
import { redirect }       from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import {
  archiveDocument,
  getDocumentById,
  restoreDocument,
  softDeleteDocument,
} from "@bloqer/services";

function getCtx(current: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>) {
  return {
    actorUserId: current.session.user.id!,
    tenantId:    current.tenantCtx!.tenantId,
    companyId:   current.tenantCtx!.companyId,
    roles:       current.tenantCtx!.roles,
  };
}

async function assertDocumentInProject(
  documentId: string,
  projectId: string,
  ctx: ReturnType<typeof getCtx>,
): Promise<void> {
  const doc = await getDocumentById(documentId, ctx);
  if (doc.projectId !== projectId) {
    throw new Error("El documento no pertenece a este proyecto");
  }
}

export async function archiveDocumentAction(
  id: string,
  projectId: string,
  extraPathsToRevalidate?: string[],
): Promise<void> {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");
  const ctx = getCtx(current);
  await assertDocumentInProject(id, projectId, ctx);
  await archiveDocument(id, ctx);
  revalidatePath(`/proyectos/${projectId}/documentos`);
  for (const p of extraPathsToRevalidate ?? []) revalidatePath(p);
}

export async function restoreDocumentAction(
  id: string,
  projectId: string,
  extraPathsToRevalidate?: string[],
): Promise<void> {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");
  const ctx = getCtx(current);
  await assertDocumentInProject(id, projectId, ctx);
  await restoreDocument(id, ctx);
  revalidatePath(`/proyectos/${projectId}/documentos`);
  for (const p of extraPathsToRevalidate ?? []) revalidatePath(p);
}

export async function softDeleteDocumentAction(
  id: string,
  projectId: string,
  options?: { extraPathsToRevalidate?: string[]; redirectToProjectDocuments?: boolean },
): Promise<void> {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");
  const ctx = getCtx(current);
  await assertDocumentInProject(id, projectId, ctx);
  await softDeleteDocument(id, ctx);
  revalidatePath(`/proyectos/${projectId}/documentos`);
  for (const p of options?.extraPathsToRevalidate ?? []) revalidatePath(p);
  if (options?.redirectToProjectDocuments !== false) {
    redirect(`/proyectos/${projectId}/documentos`);
  }
}
