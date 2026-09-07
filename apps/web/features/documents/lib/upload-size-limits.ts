/**
 * Vercel serverless request body hard limit is ~4.5 MB.
 * Multipart FormData adds overhead; keep under this for any path that
 * sends file bytes through a Server Action / Route Handler.
 */
export const VERCEL_FUNCTION_BODY_SAFE_BYTES = Math.floor(3.5 * 1024 * 1024);

/** Product max for a single document (direct-to-R2 path). */
export const MAX_DOCUMENT_UPLOAD_BYTES = 50 * 1024 * 1024;
