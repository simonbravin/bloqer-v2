import {
  INVOICE_LETTER_CODES,
  requiresArInvoiceLetter,
  type InvoiceLetterCode,
} from "@bloqer/domain";
import { ServiceError } from "../types";

/**
 * Assert invoice letter is present when the AR operation requires it ([D-084]).
 */
export function assertInvoiceLetterOnIssue(params: {
  invoiceLetter: InvoiceLetterCode | string | null | undefined;
  companyCountry: string | null | undefined;
  counterpartyCountry: string | null | undefined;
  documentLabel?: string;
}): void {
  if (!requiresArInvoiceLetter(params.companyCountry, params.counterpartyCountry)) {
    return;
  }
  if (
    params.invoiceLetter &&
    (INVOICE_LETTER_CODES as string[]).includes(params.invoiceLetter)
  ) {
    return;
  }
  const label = params.documentLabel ?? "factura";
  throw new ServiceError(
    "VALIDATION",
    `Debés indicar la letra del comprobante (A, B, C o E) antes de emitir la ${label}.`,
  );
}
