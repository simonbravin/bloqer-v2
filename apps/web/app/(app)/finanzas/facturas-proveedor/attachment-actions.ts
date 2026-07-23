"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import {
  archiveDocument,
  restoreDocument,
  softDeleteDocument,
  ServiceError,
} from "@bloqer/services";
import { redirect } from "next/navigation";
import { redirectWithActionError } from "@/lib/procurement-action-redirect";

function serviceCtx(current: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>) {
  return {
    actorUserId: current.session.user.id!,
    tenantId:    current.tenantCtx!.tenantId,
    companyId:   current.tenantCtx!.companyId,
    roles:       current.tenantCtx!.roles,
  };
}

function failOrThrow(pathsToRevalidate: string[], err: unknown): never {
  const message = err instanceof ServiceError ? err.message : "Error inesperado";
  const path = pathsToRevalidate[0];
  if (path) redirectWithActionError(path, message);
  throw err instanceof Error ? err : new Error(message);
}

/** Revalidate Finanzas invoice detail (and extras) after attachment mutations. */
export async function archiveCompanyFinanzasAttachmentAction(
  documentId: string,
  pathsToRevalidate: string[],
): Promise<void> {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");
  try {
    await archiveDocument(documentId, serviceCtx(current));
  } catch (err) {
    failOrThrow(pathsToRevalidate, err);
  }
  for (const p of pathsToRevalidate) revalidatePath(p);
}

export async function restoreCompanyFinanzasAttachmentAction(
  documentId: string,
  pathsToRevalidate: string[],
): Promise<void> {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");
  try {
    await restoreDocument(documentId, serviceCtx(current));
  } catch (err) {
    failOrThrow(pathsToRevalidate, err);
  }
  for (const p of pathsToRevalidate) revalidatePath(p);
}

export async function softDeleteCompanyFinanzasAttachmentAction(
  documentId: string,
  pathsToRevalidate: string[],
): Promise<void> {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");
  try {
    await softDeleteDocument(documentId, serviceCtx(current));
  } catch (err) {
    failOrThrow(pathsToRevalidate, err);
  }
  for (const p of pathsToRevalidate) revalidatePath(p);
}
