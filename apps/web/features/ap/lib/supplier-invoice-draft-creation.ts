export type SupplierInvoiceDraftCreationResult =
  | { id: string }
  | { error: string; uncertain?: true };

/** Preserve a confirmed draft even when refreshing the UI cache fails. */
export async function resolveSupplierInvoiceDraftCreation(input: {
  create: () => Promise<{ id: string }>;
  revalidate: (invoiceId: string) => void;
  rejectionMessage: (error: unknown) => string | null;
}): Promise<SupplierInvoiceDraftCreationResult> {
  let invoice: { id: string };
  try {
    invoice = await input.create();
  } catch (error) {
    const rejected = input.rejectionMessage(error);
    if (rejected !== null) return { error: rejected };
    return {
      error: "No se pudo comprobar si el borrador se creó. Revisá el listado de facturas antes de volver a cargarlo.",
      uncertain: true,
    };
  }

  try {
    input.revalidate(invoice.id);
  } catch {
    // No document payload, identity, financial data or raw error in this diagnostic.
    console.warn("[supplier-invoice-draft] Cache revalidation failed after confirmed creation.");
  }
  return { id: invoice.id };
}
