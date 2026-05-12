"use server";

import { revalidatePath } from "next/cache";
import { redirect }       from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import {
  archiveDocument,
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

export async function archiveDocumentAction(
  id: string,
  projectId: string,
  extraPathsToRevalidate?: string[],
): Promise<void> {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) return;
  await archiveDocument(id, getCtx(current));
  revalidatePath(`/proyectos/${projectId}/documentos`);
  for (const p of extraPathsToRevalidate ?? []) revalidatePath(p);
}

export async function restoreDocumentAction(
  id: string,
  projectId: string,
  extraPathsToRevalidate?: string[],
): Promise<void> {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) return;
  await restoreDocument(id, getCtx(current));
  revalidatePath(`/proyectos/${projectId}/documentos`);
  for (const p of extraPathsToRevalidate ?? []) revalidatePath(p);
}

export async function softDeleteDocumentAction(
  id: string,
  projectId: string,
  options?: { extraPathsToRevalidate?: string[]; redirectToProjectDocuments?: boolean },
): Promise<void> {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) return;
  await softDeleteDocument(id, getCtx(current));
  revalidatePath(`/proyectos/${projectId}/documentos`);
  for (const p of options?.extraPathsToRevalidate ?? []) revalidatePath(p);
  if (options?.redirectToProjectDocuments !== false) {
    redirect(`/proyectos/${projectId}/documentos`);
  }
}
