"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { documentRevalidatePaths } from "@/features/documents/lib/document-revalidate-paths";
import {
  archiveDocument,
  getDocumentById,
  restoreDocument,
  softDeleteDocument,
  ServiceError,
  type ServiceContext,
} from "@bloqer/services";

async function mutateCompanyAttachment(
  id: string,
  mutate: (id: string, ctx: ServiceContext) => Promise<void>,
): Promise<void> {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  try {
    const doc = await getDocumentById(id, ctx);
    if (doc.projectId !== null ||
        (doc.linkedEntityType !== "SUPPLIER_INVOICE" && doc.linkedEntityType !== "SALES_INVOICE")) {
      throw new ServiceError("FORBIDDEN", "El adjunto no pertenece a un comprobante de empresa");
    }
    await mutate(id, ctx);
    for (const path of documentRevalidatePaths({ ...doc, documentId: doc.id })) revalidatePath(path);
  } catch (err) {
    if (err instanceof ServiceError) throw new Error(err.message);
    throw err;
  }
}

export async function archiveCompanyFinanzasAttachmentAction(id: string): Promise<void> {
  await mutateCompanyAttachment(id, archiveDocument);
}

export async function restoreCompanyFinanzasAttachmentAction(id: string): Promise<void> {
  await mutateCompanyAttachment(id, restoreDocument);
}

export async function softDeleteCompanyFinanzasAttachmentAction(id: string): Promise<void> {
  await mutateCompanyAttachment(id, softDeleteDocument);
}
