import type { SupplierInvoiceDocumentPreview } from "@bloqer/ai";

/** Presentation mapping only; extraction validation and all money rules live in services. */
export function mapSupplierInvoiceDocumentPrefill(preview: SupplierInvoiceDocumentPreview) {
  if (!preview.canApply || preview.documentKind !== "INVOICE" || preview.currency !== "ARS") return null;
  if (preview.blockingReasons.length || !preview.lines.length) return null;
  return {
    issueDate: preview.issueDate ?? "",
    dueDate: preview.dueDate ?? "",
    invoiceLetter: preview.invoiceLetter,
    pricesIncludeTax: preview.pricesIncludeTax,
    iibbPerceptionRate: preview.iibbPerceptionRate ?? "",
    lines: preview.lines.map((line) => ({
      description: line.description ?? "", quantity: line.quantity ?? "", unitPrice: line.unitPrice ?? "",
      taxRate: line.taxRate ?? "", discountPct: line.discountPercent ?? "",
      wbsNodeId: null, purchaseOrderLineId: null, costAnalysisLineId: null, costType: null,
    })),
  };
}
