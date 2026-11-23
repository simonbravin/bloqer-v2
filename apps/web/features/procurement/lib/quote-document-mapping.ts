import type { ProcurementQuoteDocumentPreview } from "@bloqer/ai";
import { compareDecimal } from "@bloqer/utils";

export type QuoteRequestLine = { id: string; description: string; quantity: string; unit: string };
export type QuoteDocumentPrefill = {
  preview: ProcurementQuoteDocumentPreview;
  lines: Record<string, ProcurementQuoteDocumentPreview["lines"][number]>;
};

/** Human-selected relationships only. No fuzzy match, quantity conversion or financial math. */
export function mapQuoteDocumentLines(preview: ProcurementQuoteDocumentPreview, requestLines: QuoteRequestLine[], choices: string[]): { value?: QuoteDocumentPrefill; error?: string } {
  if (preview.blockingReasons.length) return { error: preview.blockingReasons.join(" ") };
  const mapped: QuoteDocumentPrefill["lines"] = {};
  for (let i = 0; i < preview.lines.length; i++) {
    const choice = choices[i];
    if (!choice) return { error: "Vinculá o excluí explícitamente cada renglón leído." };
    if (choice === "exclude") continue;
    const line = requestLines.find(l => l.id === choice);
    const source = preview.lines[i]!;
    if (!line || mapped[choice]) return { error: "Cada ítem de la solicitud puede recibir un único renglón de la oferta." };
    if (source.offerKind !== "NOT_QUOTED") {
      try {
        if (!source.quantity || !source.unit || compareDecimal(source.quantity, line.quantity) !== 0 || source.unit.trim().toLocaleLowerCase("es-AR") !== line.unit.trim().toLocaleLowerCase("es-AR")) return { error: "Cantidad o unidad distinta/desconocida: revisá el original por carga manual. No se convierten bultos ni se cambia la solicitud." };
      } catch { return { error: "Cantidad inválida: usá carga manual." }; }
    }
    mapped[choice] = source;
  }
  if (!Object.keys(mapped).length) return { error: "Vinculá al menos un renglón con la solicitud." };
  return { value: { preview, lines: mapped } };
}
