"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { getDocumentById, uploadDocument, ServiceError } from "@bloqer/services";
import { documentRevalidatePaths } from "./lib/document-revalidate-paths";
import {
  initiateUploadSchema,
  resolveAllowedMimeType,
} from "@bloqer/validators";
import { VERCEL_FUNCTION_BODY_SAFE_BYTES } from "@/features/documents/lib/upload-size-limits";

export type UploadDocumentActionResult =
  | { documentId: string; storageConfigured: boolean }
  | { error: string };

function readOptionalString(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Server-side upload for small files only (e.g. subcontract create attachments).
 * Larger browser uploads must use `clientUploadDocument` (direct R2).
 */
export async function uploadDocumentAction(formData: FormData): Promise<UploadDocumentActionResult> {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) {
    return { error: "No autenticado" };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Seleccioná un archivo" };
  }

  if (file.size > VERCEL_FUNCTION_BODY_SAFE_BYTES) {
    return {
      error:
        "Este archivo es demasiado grande para esta vía de subida. Usá Documentos → Agregar documento (hasta 50 MB).",
    };
  }

  const mimeType = resolveAllowedMimeType(file.name, file.type);
  if (!mimeType) {
    return {
      error: "Tipo de archivo no permitido. Formatos aceptados: PDF, imágenes, Word, Excel, CSV, texto, DWG/DXF.",
    };
  }

  const projectIdRaw = formData.get("projectId");
  const projectId =
    typeof projectIdRaw === "string" && projectIdRaw.trim().length > 0 ? projectIdRaw.trim() : null;

  const parsed = initiateUploadSchema.safeParse({
    projectId,
    originalFileName: file.name,
    mimeType,
    sizeBytes: file.size,
    category: readOptionalString(formData.get("category")) ?? "OTHER",
    description: readOptionalString(formData.get("description")) ?? null,
    linkedEntityType: readOptionalString(formData.get("linkedEntityType")),
    linkedEntityId: readOptionalString(formData.get("linkedEntityId")),
    idempotencyKey: readOptionalString(formData.get("idempotencyKey")),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues.map((e) => e.message).join(", ") };
  }

  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId:    current.tenantCtx.tenantId,
    companyId:   current.tenantCtx.companyId,
    roles:       current.tenantCtx.roles,
  };

  try {
    const content = Buffer.from(await file.arrayBuffer());
    const result  = await uploadDocument(parsed.data, content, ctx);

    const doc = await getDocumentById(result.documentId, ctx);
    for (const path of documentRevalidatePaths({ ...doc, documentId: doc.id })) revalidatePath(path);

    return result;
  } catch (err) {
    if (err instanceof ServiceError) {
      return { error: err.message };
    }
    throw err;
  }
}
