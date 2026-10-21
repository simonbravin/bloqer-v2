type AwardLine = { id: string; awardedPurchaseOrderId?: string | null };
type AwardQuote = {
  id: string;
  status: string;
  lines: Array<{ purchaseRequestLineId: string }>;
};

/** UI payload only. The service remains responsible for permissions, validity and atomicity. */
export function buildPurchaseRequestAwardGroups(
  lines: AwardLine[],
  quotes: AwardQuote[],
  selection: Record<string, string>,
) {
  const groups = new Map<string, string[]>();
  for (const line of lines) {
    if (line.awardedPurchaseOrderId) continue;
    const quoteId = selection[line.id];
    if (!quoteId) continue;
    const quote = quotes.find((q) => q.id === quoteId);
    if (
      !quote ||
      !["RECEIVED", "SELECTED"].includes(quote.status) ||
      !quote.lines.some((l) => l.purchaseRequestLineId === line.id)
    ) {
      throw new Error("La selección cambió. Revisá el proveedor de cada ítem seleccionado.");
    }
    const ids = groups.get(quoteId) ?? [];
    ids.push(line.id);
    groups.set(quoteId, ids);
  }
  if (groups.size === 0) throw new Error("Seleccioná al menos un ítem para generar órdenes.");
  return [...groups].map(([procurementQuoteId, purchaseRequestLineIds]) => ({
    procurementQuoteId,
    purchaseRequestLineIds,
  }));
}
