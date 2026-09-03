/**
 * Soft-delete is allowed for the project document library only
 * (`linkedEntityType` PROJECT or legacy null). Attachments bound to an
 * invoice, quote, jobsite log, PO, etc. stay as evidence — archive them.
 */

export const LINKED_DOCUMENT_DELETE_BLOCKED_MESSAGE =
  "Este archivo está ligado a una factura, cotización, libro de obra u otro documento operativo y no se puede eliminar. Archiválo si no querés verlo.";

export function isStandaloneProjectDocument(
  linkedEntityType: string | null | undefined,
): boolean {
  return linkedEntityType == null || linkedEntityType === "PROJECT";
}

/** Cancel of an abandoned UPLOADING row is always allowed if the actor can mutate. */
export function canSoftDeleteDocumentByLink(params: {
  status: string;
  linkedEntityType: string | null | undefined;
}): boolean {
  if (params.status === "DELETED") return false;
  if (params.status === "UPLOADING") return true;
  return isStandaloneProjectDocument(params.linkedEntityType);
}
