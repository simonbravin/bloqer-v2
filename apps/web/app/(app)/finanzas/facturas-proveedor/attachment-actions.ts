"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import {
  archiveDocument,
  restoreDocument,
  softDeleteDocument,
} from "@bloqer/services";
import { redirect } from "next/navigation";

function serviceCtx(current: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>) {
  return {
    actorUserId: current.session.user.id!,
    tenantId:    current.tenantCtx!.tenantId,
    companyId:   current.tenantCtx!.companyId,
    roles:       current.tenantCtx!.roles,
  };
}

/** Revalidate Finanzas invoice detail (and extras) after attachment mutations. */
export async function archiveCompanyFinanzasAttachmentAction(
  documentId: string,
  pathsToRevalidate: string[],
): Promise<void> {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");
  await archiveDocument(documentId, serviceCtx(current));
  for (const p of pathsToRevalidate) revalidatePath(p);
}

export async function restoreCompanyFinanzasAttachmentAction(
  documentId: string,
  pathsToRevalidate: string[],
): Promise<void> {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");
  await restoreDocument(documentId, serviceCtx(current));
  for (const p of pathsToRevalidate) revalidatePath(p);
}

export async function softDeleteCompanyFinanzasAttachmentAction(
  documentId: string,
  pathsToRevalidate: string[],
): Promise<void> {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");
  await softDeleteDocument(documentId, serviceCtx(current));
  for (const p of pathsToRevalidate) revalidatePath(p);
}
