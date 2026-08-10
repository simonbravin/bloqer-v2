/**
 * Argentine invoice letter suggestion (A/B/C/E) — [D-084].
 * Pure helper: no I/O. Does not block user overrides.
 */

export type IvaConditionCode =
  | "RESPONSIBLE_INSCRIPTO"
  | "MONOTAX"
  | "EXEMPT"
  | "FINAL_CONSUMER"
  | "NOT_CATEGORIZED"
  | "FOREIGN";

export type InvoiceLetterCode = "A" | "B" | "C" | "E";

const AR_COUNTRY = "AR";

export function requiresArInvoiceLetter(
  companyCountry: string | null | undefined,
  counterpartyCountry: string | null | undefined,
): boolean {
  const company = (companyCountry ?? "").toUpperCase();
  const counterparty = (counterpartyCountry ?? "").toUpperCase();
  return company === AR_COUNTRY || counterparty === AR_COUNTRY;
}

export type SuggestInvoiceLetterInput = {
  issuerIvaCondition: IvaConditionCode | null | undefined;
  receiverIvaCondition: IvaConditionCode | null | undefined;
  /** Receiver country ISO-2; used to treat non-AR as export (E) when issuer is RI. */
  receiverCountry?: string | null | undefined;
};

/**
 * Suggest letter from issuer × receiver IVA conditions.
 * Returns null when data is insufficient for a confident suggestion.
 */
export function suggestInvoiceLetter(
  input: SuggestInvoiceLetterInput,
): InvoiceLetterCode | null {
  const issuer = input.issuerIvaCondition ?? null;
  const receiver = input.receiverIvaCondition ?? null;
  const receiverCountry = (input.receiverCountry ?? "").toUpperCase();

  if (!issuer) return null;

  if (issuer === "MONOTAX" || issuer === "EXEMPT") {
    return "C";
  }

  if (issuer !== "RESPONSIBLE_INSCRIPTO") {
    return null;
  }

  // RI issuer
  if (
    receiver === "FOREIGN" ||
    (receiverCountry.length === 2 && receiverCountry !== AR_COUNTRY)
  ) {
    return "E";
  }

  if (receiver === "RESPONSIBLE_INSCRIPTO") {
    return "A";
  }

  if (
    receiver === "FINAL_CONSUMER" ||
    receiver === "MONOTAX" ||
    receiver === "EXEMPT" ||
    receiver === "NOT_CATEGORIZED"
  ) {
    return "B";
  }

  return null;
}

/** UI labels (es-AR) for invoice letters. */
export const INVOICE_LETTER_LABEL_ES: Record<InvoiceLetterCode, string> = {
  A: "Factura A",
  B: "Factura B",
  C: "Factura C",
  E: "Factura E",
};

/** UI labels (es-AR) for IVA conditions. */
export const IVA_CONDITION_LABEL_ES: Record<IvaConditionCode, string> = {
  RESPONSIBLE_INSCRIPTO: "Responsable Inscripto",
  MONOTAX: "Monotributo",
  EXEMPT: "Exento",
  FINAL_CONSUMER: "Consumidor Final",
  NOT_CATEGORIZED: "No categorizado",
  FOREIGN: "Sujeto del exterior",
};

export const INVOICE_LETTER_CODES: InvoiceLetterCode[] = ["A", "B", "C", "E"];

export const IVA_CONDITION_CODES: IvaConditionCode[] = [
  "RESPONSIBLE_INSCRIPTO",
  "MONOTAX",
  "EXEMPT",
  "FINAL_CONSUMER",
  "NOT_CATEGORIZED",
  "FOREIGN",
];

/** Display label for IVA condition (es-AR). Safe for server and client. */
export function formatIvaConditionLabel(
  code: string | null | undefined,
): string {
  if (!code) return "—";
  if ((IVA_CONDITION_CODES as string[]).includes(code)) {
    return IVA_CONDITION_LABEL_ES[code as IvaConditionCode];
  }
  return code;
}

/** Display badge for invoice letter A/B/C/E. Safe for server and client. */
export function formatInvoiceLetterBadge(
  letter: string | null | undefined,
): string | null {
  if (!letter) return null;
  if ((INVOICE_LETTER_CODES as string[]).includes(letter)) {
    return INVOICE_LETTER_LABEL_ES[letter as InvoiceLetterCode];
  }
  return `Factura ${letter}`;
}
