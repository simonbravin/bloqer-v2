import { resolveAllowedMimeType } from "@bloqer/validators";
import { MAX_DOCUMENT_UPLOAD_BYTES } from "./upload-size-limits";

export type ClientUploadDocumentInput = {
  file: File;
  projectId: string | null;
  category: string;
  description?: string | null;
  folderId?: string | null;
  linkedEntityType?: string;
  linkedEntityId?: string;
  idempotencyKey: string;
  replacesAttachmentId?: string;
};

export type ClientUploadDocumentResult =
  | { documentId: string; storageConfigured: boolean }
  | { error: string };

/** Reuses the stored attempt; never creates metadata or uploads another object. */
export async function clientConfirmDocumentUpload(documentId: string): Promise<ClientUploadDocumentResult> {
  const response = await fetch(`/api/documents/${encodeURIComponent(documentId)}/confirm`, {
    method: "POST",
  }).catch(() => null);
  if (!response) return { error: "No se pudo confirmar la subida. Revisá la conexión e intentá de nuevo." };
  const data = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
  if (!response.ok || data?.ok !== true) {
    return { error: data?.error ?? "No se pudo comprobar la confirmación. Reintentá sobre esta misma carga." };
  }
  return { documentId, storageConfigured: true };
}

/**
 * Browser upload: always direct-to-R2 (initiate → PUT → confirm).
 * Bypasses Vercel’s ~4.5 MB function body limit; requires bucket CORS
 * for the app origin (see FILE_STORAGE_ARCHITECTURE / ENVIRONMENT_VARIABLES).
 */
export async function clientUploadDocument(
  input: ClientUploadDocumentInput,
): Promise<ClientUploadDocumentResult> {
  const mimeType = resolveAllowedMimeType(input.file.name, input.file.type);
  if (!mimeType) {
    return {
      error:
        "Tipo de archivo no permitido. Formatos aceptados: PDF, imágenes, Word, Excel, CSV, texto, DWG/DXF.",
    };
  }
  if (input.file.size <= 0) {
    return { error: "Seleccioná un archivo" };
  }
  if (input.file.size > MAX_DOCUMENT_UPLOAD_BYTES) {
    return { error: "El archivo no puede superar 50 MB" };
  }

  const initiateRes = await fetch("/api/documents/initiate-upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      projectId: input.projectId,
      originalFileName: input.file.name,
      mimeType,
      sizeBytes: input.file.size,
      category: input.category,
      description: input.description?.trim() ? input.description.trim() : null,
      idempotencyKey: input.idempotencyKey,
      ...(input.replacesAttachmentId ? { replacesAttachmentId: input.replacesAttachmentId } : {}),
      ...(input.folderId ? { folderId: input.folderId } : {}),
      ...(input.linkedEntityType && input.linkedEntityId
        ? {
            linkedEntityType: input.linkedEntityType,
            linkedEntityId: input.linkedEntityId,
          }
        : {}),
    }),
  }).catch(() => null);
  if (!initiateRes) return { error: "No se pudo iniciar la subida. Revisá la conexión e intentá de nuevo." };

  let initiateData: {
    documentId?: string;
    uploadUrl?: string | null;
    storageConfigured?: boolean;
    status?: "UPLOADING" | "ACTIVE";
    error?: string;
  };
  try {
    initiateData = (await initiateRes.json()) as typeof initiateData;
  } catch {
    return { error: "Error al iniciar la subida" };
  }

  if (!initiateRes.ok) {
    return { error: initiateData.error ?? "Error al iniciar la subida" };
  }

  const documentId = initiateData.documentId;
  if (!documentId) {
    return { error: "Respuesta inesperada del servidor" };
  }
  if (initiateData.storageConfigured !== true) {
    return { error: "El archivo no quedó almacenado. Conservá el original e intentá de nuevo cuando se restablezca el almacenamiento." };
  }

  const needsPut = Boolean(initiateData.uploadUrl);

  if (needsPut && initiateData.uploadUrl) {
    let putRes: Response;
    try {
      putRes = await fetch(initiateData.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": mimeType, "If-None-Match": "*" },
        body: input.file,
      });
    } catch {
      return {
        error:
          "No se pudo subir al almacenamiento (red o CORS). Verificá la política CORS del bucket R2 para portal.bloqer.app.",
      };
    }

    // An earlier PUT may have succeeded even if its response was lost.
    // The signed create-once upload returns 412 in that case; confirm the existing bytes.
    if (!putRes.ok && putRes.status !== 412) {
      return {
        error:
          putRes.status === 403
            ? "El almacenamiento rechazó la subida (CORS o URL vencida). Revisá CORS en R2 e intentá de nuevo."
            : "Error al subir el archivo al almacenamiento. Intentá de nuevo.",
      };
    }

    return clientConfirmDocumentUpload(documentId);
  } else if (initiateData.status !== "ACTIVE") {
    return {
      error: "No se pudo obtener la URL de subida. Recargá e intentá de nuevo.",
    };
  }

  return {
    documentId,
    storageConfigured: Boolean(initiateData.storageConfigured),
  };
}
