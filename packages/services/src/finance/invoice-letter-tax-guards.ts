import { evaluateInvoiceLetterTaxConsistency } from "@bloqer/domain";
import { ServiceError } from "../types";

/**
 * Block issue when letter C/E has positive tax ([D-085]).
 * Warnings (A/B with 0%) are UI-only — certification often uses 0% because PU includes tax.
 */
export function assertInvoiceLetterTaxConsistencyOnIssue(params: {
  invoiceLetter: string | null | undefined;
  taxAmount: { toString(): string } | string | number | null | undefined;
  documentLabel?: string;
}): void {
  const taxStr =
    params.taxAmount == null
      ? "0"
      : typeof params.taxAmount === "string" || typeof params.taxAmount === "number"
        ? String(params.taxAmount)
        : params.taxAmount.toString();
  const issues = evaluateInvoiceLetterTaxConsistency({
    invoiceLetter: params.invoiceLetter,
    taxAmount: taxStr,
  });
  const hard = issues.find((i) => i.severity === "error");
  if (hard) {
    throw new ServiceError("VALIDATION", hard.message);
  }
}
