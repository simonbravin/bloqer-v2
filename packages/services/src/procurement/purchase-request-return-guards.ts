import type { ProcurementQuoteStatus } from "@bloqer/database";
import { ServiceError } from "../types";

/** D-126: every historical quote blocks return-to-draft, regardless of status. */
export const PURCHASE_REQUEST_BLOCKING_QUOTE_STATUSES = [
  "DRAFT",
  "RECEIVED",
  "SELECTED",
  "REJECTED",
  "SUPERSEDED",
] as const satisfies readonly ProcurementQuoteStatus[];

export function isBlockingProcurementQuoteStatus(status: string): boolean {
  return (PURCHASE_REQUEST_BLOCKING_QUOTE_STATUSES as readonly string[]).includes(status);
}

/**
 * Gates for SUBMITTED → DRAFT ([BR-PUR-025]).
 * Call after loading status + counts from DB.
 * `quoteCount` counts all quotations, including rejected/superseded history.
 */
export function assertPurchaseRequestReturnable(input: {
  status: string;
  quoteCount: number;
  activePoCount: number;
  awardedLineCount: number;
}): void {
  if (input.status !== "SUBMITTED") {
    throw new ServiceError(
      "CONFLICT",
      "Solo se puede devolver a borrador una solicitud enviada (sin adjudicar)",
    );
  }
  if (input.quoteCount > 0) {
    throw new ServiceError(
      "CONFLICT",
      "Esta solicitud ya tiene antecedentes de cotización. No se puede devolver a borrador; anulala y creá otra para cambiar sus ítems.",
    );
  }
  if (input.activePoCount > 0) {
    throw new ServiceError(
      "CONFLICT",
      "Hay órdenes de compra vinculadas. Anulá la OC primero.",
    );
  }
  if (input.awardedLineCount > 0) {
    throw new ServiceError(
      "CONFLICT",
      "Hay ítems adjudicados. No se puede devolver a borrador.",
    );
  }
}
