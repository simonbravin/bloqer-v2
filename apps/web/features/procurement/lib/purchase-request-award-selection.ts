import { isQuoteLineAwardable, QUOTE_LINE_OFFER_LABELS, type QuoteLineOfferKind } from "@bloqer/domain";
import { compareDecimal } from "@bloqer/utils";

type OfferLine = { offerKind?: QuoteLineOfferKind | null; lineTotal: string };

export function canAwardQuoteLine(line: OfferLine): boolean {
  return isQuoteLineAwardable(line.offerKind, compareDecimal(line.lineTotal, "0") > 0);
}

export function canQuickAwardQuoteLine(line: OfferLine): boolean {
  return line.offerKind !== "BONIFIED" && line.offerKind !== "NOT_QUOTED" && compareDecimal(line.lineTotal, "0") > 0;
}

export function quoteLineOfferLabel(line: OfferLine, pendingAward = true): string {
  return line.offerKind ? QUOTE_LINE_OFFER_LABELS[line.offerKind]
    : !pendingAward || compareDecimal(line.lineTotal, "0") > 0 ? "Sin clasificar (histórico)" : "Cero sin clasificar · revisar";
}

type AwardLine = { id: string; awardedPurchaseOrderId?: string | null };
type AwardQuote = {
  id: string;
  status: string;
  lines: Array<{ purchaseRequestLineId: string } & OfferLine>;
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
      !quote.lines.some((l) => l.purchaseRequestLineId === line.id && canAwardQuoteLine(l))
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
