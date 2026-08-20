import { resolveAllowedMimeType } from "@bloqer/validators";

export const MAX_UPLOAD_SIZE_BYTES = 50 * 1024 * 1024;

export function formatUploadSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function isImageUploadFile(file: { name: string; type: string }): boolean {
  if (file.type.startsWith("image/")) return true;
  return /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(file.name);
}

export function validateUploadFile(file: File): string | null {
  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    return "El archivo no puede superar 50 MB";
  }
  const mime = resolveAllowedMimeType(file.name, file.type);
  if (!mime) {
    return "Tipo de archivo no permitido. Formatos aceptados: PDF, imágenes, Word, Excel, CSV, texto.";
  }
  return null;
}
