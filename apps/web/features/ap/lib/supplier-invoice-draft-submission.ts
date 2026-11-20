import type { SupplierInvoiceDraftCreationResult } from "./supplier-invoice-draft-creation";

/** UI recovery only: all creation and upload permissions remain in their services. */
export type SupplierInvoiceDraftSubmissionResult =
  | { kind: "saved"; invoiceId: string }
  | { kind: "attachment_failed"; invoiceId: string; error: string }
  | { kind: "rejected"; error: string }
  | { kind: "uncertain"; error: string };

export async function submitSupplierInvoiceDraft(input: {
  knownInvoiceId: string | null;
  create: () => Promise<SupplierInvoiceDraftCreationResult>;
  onCreated: (invoiceId: string) => void;
  upload: (invoiceId: string) => Promise<unknown>;
}): Promise<SupplierInvoiceDraftSubmissionResult> {
  let invoiceId = input.knownInvoiceId;
  if (!invoiceId) {
    let result: SupplierInvoiceDraftCreationResult;
    try {
      result = await input.create();
    } catch {
      return {
        kind: "uncertain",
        error: "No se pudo comprobar si el borrador se creó. Revisá el listado de facturas antes de volver a cargarlo.",
      };
    }
    if ("error" in result) {
      return { kind: result.uncertain ? "uncertain" : "rejected", error: result.error };
    }
    invoiceId = result.id;
    // Remember the confirmed mutation before attempting its independent attachment.
    input.onCreated(invoiceId);
  }
  try {
    const uploaded = await input.upload(invoiceId);
    if (uploaded && typeof uploaded === "object" && "error" in uploaded) {
      return {
        kind: "attachment_failed",
        invoiceId,
        error: typeof uploaded.error === "string" ? uploaded.error : "No se pudo adjuntar el comprobante.",
      };
    }
    if (uploaded && typeof uploaded === "object" && "storageConfigured" in uploaded && uploaded.storageConfigured === false) {
      return { kind: "attachment_failed", invoiceId, error: "El almacenamiento no está disponible. El borrador está guardado, pero falta conservar el archivo original." };
    }
    return { kind: "saved", invoiceId };
  } catch {
    return { kind: "attachment_failed", invoiceId, error: "Se perdió la conexión durante la subida." };
  }
}
