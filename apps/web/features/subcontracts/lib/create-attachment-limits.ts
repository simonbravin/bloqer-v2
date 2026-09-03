/** Keep under Next `serverActions.bodySizeLimit` (52mb) plus form fields. */
export const MAX_CREATE_ATTACHMENT_FILES = 8;
export const MAX_CREATE_ATTACHMENT_TOTAL_BYTES = 45 * 1024 * 1024;

export const CREATE_ATTACHMENT_TOTAL_MB = Math.round(
  MAX_CREATE_ATTACHMENT_TOTAL_BYTES / (1024 * 1024),
);

export function createAttachmentLimitHint(): string {
  return `máx. ${MAX_CREATE_ATTACHMENT_FILES} archivos, ${CREATE_ATTACHMENT_TOTAL_MB} MB en total`;
}
