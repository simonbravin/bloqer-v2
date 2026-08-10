/**
 * Common Argentine IVA rates used in construction ops ([D-085] / MASTER_DATA TaxType defaults).
 * Not a fiscal engine — presets for UX and soft consistency with invoice letter ([D-084]).
 */

import type { InvoiceLetterCode } from "./suggest-invoice-letter";

export const IVA_RATE_PRESETS = ["0", "10.5", "21", "27"] as const;

export type IvaRatePreset = (typeof IVA_RATE_PRESETS)[number];

export const IVA_RATE_LABEL_ES: Record<IvaRatePreset, string> = {
  "0": "0% — sin IVA / exento",
  "10.5": "10,5% — alícuota reducida (obra vivienda)",
  "21": "21% — alícuota general",
  "27": "27% — alícuota diferencial",
};

/** Short hint for construction operators (not legal advice). */
export const IVA_RATE_CONSTRUCTION_HINT_ES =
  "En obra, 10,5% suele aplicar a locación de obra destinada a vivienda (mano de obra + materiales del contrato). Materiales sueltos, artefactos y muchos honorarios suelen ir al 21%.";

/** Suggested default tax rate when the user picks a letter (editable). */
export function defaultTaxRateForInvoiceLetter(
  letter: InvoiceLetterCode | null | undefined,
): IvaRatePreset {
  switch (letter) {
    case "A":
      return "21";
    case "B":
      return "21";
    case "C":
    case "E":
      return "0";
    default:
      return "21";
  }
}

/** Map stored/custom rate strings (e.g. "21.0000") onto a preset when numerically equal. */
export function normalizeIvaRatePreset(
  value: string | null | undefined,
): IvaRatePreset | null {
  if (value == null || value.trim() === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  for (const preset of IVA_RATE_PRESETS) {
    if (Number(preset) === n) return preset;
  }
  return null;
}

export type InvoiceLetterTaxIssue = {
  severity: "error" | "warning";
  message: string;
};

/**
 * Soft/hard consistency between letter and aggregated tax amount.
 * Callers decide whether to block on `error` (issue) or only warn in UI.
 */
export function evaluateInvoiceLetterTaxConsistency(params: {
  invoiceLetter: InvoiceLetterCode | string | null | undefined;
  taxAmount: string | number | null | undefined;
}): InvoiceLetterTaxIssue[] {
  const letter = params.invoiceLetter;
  const tax = Number(params.taxAmount ?? 0);
  const issues: InvoiceLetterTaxIssue[] = [];
  if (!letter) return issues;

  if ((letter === "C" || letter === "E") && tax > 0) {
    issues.push({
      severity: "error",
      message:
        letter === "C"
          ? "Factura C no debería llevar IVA discriminado. Revisá las alícuotas de las líneas o cambiá la letra."
          : "Factura E (exportación) no debería llevar IVA. Revisá las alícuotas o la letra.",
    });
  }

  if (letter === "A" && tax === 0) {
    issues.push({
      severity: "warning",
      message:
        "Factura A suele discriminar IVA (p. ej. 21% o 10,5%). Si el precio ya incluye impuestos (certificación), dejá 0% a conciencia.",
    });
  }

  if (letter === "B" && tax === 0) {
    issues.push({
      severity: "warning",
      message:
        "Factura B suele incluir IVA en el precio. Si el neto ya viene con IVA, cargá 0%; si el precio es neto, usá la alícuota correspondiente.",
    });
  }

  return issues;
}
