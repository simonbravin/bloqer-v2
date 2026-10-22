/** D-118: null is historical and must never be inferred to mean a free offer. */
export const QUOTE_LINE_OFFER_KINDS = ["QUOTED", "NOT_QUOTED", "BONIFIED"] as const;
export type QuoteLineOfferKind = (typeof QUOTE_LINE_OFFER_KINDS)[number];

export const QUOTE_LINE_OFFER_LABELS: Record<QuoteLineOfferKind, string> = {
  QUOTED: "Cotizado",
  NOT_QUOTED: "No cotizado",
  BONIFIED: "Bonificado",
};

export function isQuoteLineAwardable(
  offerKind: QuoteLineOfferKind | null | undefined,
  hasPositiveTotal: boolean,
): boolean {
  return offerKind === "BONIFIED" || (offerKind !== "NOT_QUOTED" && hasPositiveTotal);
}
