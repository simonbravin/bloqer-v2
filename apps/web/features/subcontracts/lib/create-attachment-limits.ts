import { VERCEL_FUNCTION_BODY_SAFE_BYTES } from "@/features/documents/lib/upload-size-limits";

/**
 * Create-subcontract attachments still travel through a Server Action
 * (bytes in FormData → `uploadDocument`). Until create uses direct-to-R2,
 * total payload must stay under Vercel’s ~4.5 MB function body limit.
 */
export const MAX_CREATE_ATTACHMENT_FILES = 8;
export const MAX_CREATE_ATTACHMENT_TOTAL_BYTES = VERCEL_FUNCTION_BODY_SAFE_BYTES;

export const CREATE_ATTACHMENT_TOTAL_MB = Math.round(
  MAX_CREATE_ATTACHMENT_TOTAL_BYTES / (1024 * 1024),
);

export function createAttachmentLimitHint(): string {
  return `máx. ${MAX_CREATE_ATTACHMENT_FILES} archivos, ${CREATE_ATTACHMENT_TOTAL_MB} MB en total (límite de la vía de creación; archivos más grandes desde el detalle)`;
}
