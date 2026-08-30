/** Pure helpers for document file access / preview (safe to import from Server Components). */

/** MIME / extension that browsers can usually open in a new tab. */
export function canPreviewInBrowser(mimeType: string, fileName: string): boolean {
  const mime = mimeType.toLowerCase().trim();
  if (
    mime === "application/pdf" ||
    mime === "image/jpeg" ||
    mime === "image/png" ||
    mime === "image/webp" ||
    mime === "image/heic" ||
    mime === "image/heif"
  ) {
    return true;
  }
  // Only fall back to extension when MIME is missing or opaque.
  if (mime && mime !== "application/octet-stream") {
    return false;
  }
  return /\.(pdf|jpe?g|png|webp|heic|heif)$/i.test(fileName);
}

/**
 * jpeg/png/webp only — safe for in-page `<img>` (not HEIC/PDF).
 * Prefer declared MIME; extension is used only when MIME is empty/opaque.
 */
export function canInlineImagePreview(mimeType: string, fileName: string): boolean {
  const mime = mimeType.toLowerCase().trim();
  if (mime === "image/jpeg" || mime === "image/png" || mime === "image/webp") {
    return true;
  }
  if (mime && mime !== "application/octet-stream") {
    return false;
  }
  return /\.(jpe?g|png|webp)$/i.test(fileName);
}

/** Whether a stored attachment looks like an image (for thumbnails, incl. HEIC). */
export function isImageLikeDocument(mimeType: string, fileName: string): boolean {
  const mime = mimeType.toLowerCase().trim();
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
  if (mime.startsWith("image/")) {
    return true;
  }
  if (mime && mime !== "application/octet-stream") {
    return false;
  }
  return /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(fileName);
}

export function documentDownloadHref(
  documentId: string,
  disposition: "inline" | "attachment",
): string {
  return `/api/documents/${encodeURIComponent(documentId)}/download?disposition=${disposition}`;
}

export function canAccessDocumentFile(opts: {
  storageProvider: string;
  status: string;
}): boolean {
  return (
    opts.storageProvider === "R2" &&
    (opts.status === "ACTIVE" || opts.status === "ARCHIVED")
  );
}
