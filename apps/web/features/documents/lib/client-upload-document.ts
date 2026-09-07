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
  revalidatePaths?: string[];
};

export type ClientUploadDocumentResult =
  | { documentId: string; storageConfigured: boolean }
  | { error: string };

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
        "Tipo de archivo no permitido. Formatos aceptados: PDF, imágenes, Word, Excel, CSV, texto.",
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
      ...(input.folderId ? { folderId: input.folderId } : {}),
      ...(input.linkedEntityType && input.linkedEntityId
        ? {
            linkedEntityType: input.linkedEntityType,
            linkedEntityId: input.linkedEntityId,
          }
        : {}),
    }),
  });

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

  const paths = input.revalidatePaths ?? [];
  const needsPut = Boolean(initiateData.uploadUrl);

  if (needsPut && initiateData.uploadUrl) {
    let putRes: Response;
    try {
      putRes = await fetch(initiateData.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": mimeType },
        body: input.file,
      });
    } catch {
      return {
        error:
          "No se pudo subir al almacenamiento (red o CORS). Verificá la política CORS del bucket R2 para portal.bloqer.app.",
      };
    }

    if (!putRes.ok) {
      return {
        error:
          putRes.status === 403
            ? "El almacenamiento rechazó la subida (CORS o URL vencida). Revisá CORS en R2 e intentá de nuevo."
            : "Error al subir el archivo al almacenamiento. Intentá de nuevo.",
      };
    }

    const confirmRes = await fetch(`/api/documents/${documentId}/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ revalidatePaths: paths }),
    });
    const confirmData = (await confirmRes.json().catch(() => ({}))) as { error?: string };
    if (!confirmRes.ok) {
      return {
        error:
          confirmData.error ??
          "El archivo se subió pero no se pudo confirmar. Intentá de nuevo o contactá soporte.",
      };
    }
  } else if (initiateData.storageConfigured && initiateData.status === "UPLOADING") {
    return {
      error: "No se pudo obtener la URL de subida. Recargá e intentá de nuevo.",
    };
  }

  return {
    documentId,
    storageConfigured: Boolean(initiateData.storageConfigured),
  };
}
