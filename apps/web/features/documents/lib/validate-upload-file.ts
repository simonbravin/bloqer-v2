import { resolveAllowedMimeType } from "@bloqer/validators";
import { MAX_DOCUMENT_UPLOAD_BYTES } from "./upload-size-limits";

export const MAX_UPLOAD_SIZE_BYTES = MAX_DOCUMENT_UPLOAD_BYTES;

export function formatUploadSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function uploadFormatsHint(opts?: {
  maxTotalBytes?: number;
  maxFiles?: number;
}): string {
  const bits = ["PDF, imágenes, Word, Excel, CSV, texto, DWG/DXF"];
  if (opts?.maxTotalBytes != null) {
    bits.push(`máx. ${Math.round(opts.maxTotalBytes / (1024 * 1024))} MB en total`);
  } else {
    bits.push("máx. 50 MB");
  }
  if (opts?.maxFiles != null && opts.maxFiles > 1) {
    bits.push(`hasta ${opts.maxFiles} archivos`);
  }
  return bits.join(" · ");
}

export function isImageUploadFile(file: { name: string; type: string }): boolean {
  const mime = file.type.toLowerCase().trim();
  if (
    mime === "image/jpeg" ||
    mime === "image/png" ||
    mime === "image/webp" ||
    mime === "image/heic" ||
    mime === "image/heif" ||
    mime === "image/gif"
  ) {
    return true;
  }
  if (mime && mime !== "application/octet-stream") {
    return false;
  }
  return /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(file.name);
}

export function validateUploadFile(file: File): string | null {
  if (file.size <= 0) {
    return "El archivo está vacío";
  }
  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    return "El archivo no puede superar 50 MB";
  }
  const mime = resolveAllowedMimeType(file.name, file.type);
  if (!mime) {
    return "Tipo de archivo no permitido. Formatos aceptados: PDF, imágenes, Word, Excel, CSV, texto, DWG/DXF.";
  }
  return null;
}
