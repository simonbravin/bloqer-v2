"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { uploadDocument, ServiceError } from "@bloqer/services";
import { isStorageConfigured } from "@bloqer/config";
import {
  initiateUploadSchema,
  resolveAllowedMimeType,
} from "@bloqer/validators";

const MAX_SIZE_BYTES = 50 * 1024 * 1024;

export type UploadDocumentActionResult =
  | { documentId: string; storageConfigured: boolean }
  | { error: string };

function readOptionalString(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseRevalidatePaths(raw: FormDataEntryValue | null): string[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.filter((p): p is string => typeof p === "string" && p.startsWith("/")))];
  } catch {
    return [];
  }
}

export async function uploadDocumentAction(formData: FormData): Promise<UploadDocumentActionResult> {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) {
    return { error: "No autenticado" };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Seleccioná un archivo" };
  }

  if (file.size > MAX_SIZE_BYTES) {
    return { error: "El archivo no puede superar 50 MB" };
  }

  const mimeType = resolveAllowedMimeType(file.name, file.type);
  if (!mimeType) {
    return {
      error: "Tipo de archivo no permitido. Formatos aceptados: PDF, imágenes, Word, Excel, CSV, texto.",
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
  });

  if (!parsed.success) {
    return { error: parsed.error.errors.map((e) => e.message).join(", ") };
  }

  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId:    current.tenantCtx.tenantId,
    companyId:   current.tenantCtx.companyId,
    roles:       current.tenantCtx.roles,
  };

  const revalidatePaths = parseRevalidatePaths(formData.get("revalidatePaths"));
  const storageReady    = isStorageConfigured();

  try {
    const content = storageReady ? Buffer.from(await file.arrayBuffer()) : Buffer.alloc(0);
    const result  = await uploadDocument(parsed.data, content, ctx);

    for (const path of revalidatePaths) {
      revalidatePath(path);
    }

    return result;
  } catch (err) {
    if (err instanceof ServiceError) {
      return { error: err.message };
    }
    throw err;
  }
}
