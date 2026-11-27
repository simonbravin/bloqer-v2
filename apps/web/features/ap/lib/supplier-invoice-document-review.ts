import { isZeroIvaRate } from "@bloqer/domain";

/** UI completion only. Financial validity and recalculation remain in the AP service. */
export function getSupplierInvoiceDocumentReview(input: {
  supplierContactId: string;
  invoiceLetter: string | null;
  requireLetter: boolean;
  issueDate: string;
  dueDate: string;
  pricesIncludeTax: boolean | null;
  iibbPerceptionRate: string;
  requireWbs: boolean;
  lines: Array<{
    description: string; quantity: string; unitPrice: string; taxRate: string; discountPct: string;
    wbsNodeId?: string | null; costType?: string | null;
  }>;
}) {
  const pending: Array<{ label: string; target: string }> = [];
  if (!input.supplierContactId) pending.push({ label: "Elegí a quién se le paga.", target: "invoice-payee" });
  if (input.requireLetter && !input.invoiceLetter) pending.push({ label: "Seleccioná la letra del comprobante.", target: "invoiceLetter" });
  if (!input.issueDate) pending.push({ label: "Completá la fecha de emisión.", target: "issueDate" });
  if (!input.dueDate) pending.push({ label: "Completá el vencimiento.", target: "dueDate" });
  if (input.pricesIncludeTax === null) pending.push({ label: "Indicá si los precios incluyen IVA.", target: "document-price-basis" });
  if (!input.iibbPerceptionRate.trim()) pending.push({ label: "Completá IIBB; ingresá 0 si no corresponde.", target: "document-iibb-rate" });
  if ((input.invoiceLetter === "C" || input.invoiceLetter === "E") &&
    (input.pricesIncludeTax === true || input.lines.some((line) => line.taxRate.trim() && !isZeroIvaRate(line.taxRate)))) {
    pending.push({ label: "La letra C/E no admite IVA: revisá la letra, los precios y las alícuotas.", target: "invoiceLetter" });
  }
  const incompleteLines = input.lines.filter((line) =>
    !line.description.trim() || !line.quantity.trim() || !line.unitPrice.trim() || !line.taxRate.trim() || !line.discountPct.trim(),
  ).length;
  if (!input.lines.length || incompleteLines) pending.push({
    label: input.lines.length ? `Completá los datos de ${incompleteLines} ${incompleteLines === 1 ? "renglón" : "renglones"}; descuentos e IVA ausentes no equivalen a cero.` : "Agregá los renglones de la factura.",
    target: "invoice-lines",
  });
  if (input.requireWbs && input.lines.some((line) => !line.wbsNodeId || !line.costType)) pending.push({
    label: "Revisá la partida EDT y el tipo de costo de cada renglón.", target: "invoice-lines",
  });
  return {
    pending,
    amountsPending: input.pricesIncludeTax === null || !input.iibbPerceptionRate.trim() || !input.lines.length || input.lines.some((line) =>
      !line.quantity.trim() || !line.unitPrice.trim() || !line.taxRate.trim() || !line.discountPct.trim(),
    ),
  };
}

export function supplierInvoiceDocumentFileError(file: Pick<File, "type" | "size"> | null): string | null {
  if (!file) return null;
  if (!["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    return "Para leer el comprobante, elegí un PDF, JPEG, PNG o WebP. Podés conservar este archivo como adjunto y seguir con Carga manual.";
  }
  if (file.size <= 0 || file.size > 3 * 1024 * 1024) {
    return "La lectura admite hasta 3 MiB por archivo. Elegí un archivo más liviano o seguí con Carga manual conservando este adjunto.";
  }
  return null;
}
