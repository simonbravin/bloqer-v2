"use client";

import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatMoneyAmount } from "@/lib/format-money";

export type AmountSuggestion = {
  /** Etiqueta corta, ej. "Saldo pendiente". */
  label: string;
  /** Valor decimal exacto a insertar (string). No se re-redondea. */
  amount: string;
  /** Moneda ISO opcional para el formato de visualización. */
  currency?: string;
  /** Texto ya formateado a mostrar; si falta se calcula con formatMoneyAmount. */
  display?: string;
  /** Marca visual de alerta (ej. excede saldo de partida). */
  exceeds?: boolean;
  /** Deshabilita el chip (ej. no hay valor de referencia). */
  disabled?: boolean;
};

interface Props {
  suggestions: AmountSuggestion[];
  /** Recibe el `amount` exacto de la sugerencia elegida. */
  onPick: (amount: string, suggestion: AmountSuggestion) => void;
  /**
   * Mensaje de confirmación (toast). `true` usa un texto por defecto,
   * o pasá una función para personalizarlo. `false`/omitido: sin toast.
   */
  toastOnPick?: boolean | ((suggestion: AmountSuggestion) => string);
  className?: string;
}

/**
 * Chips clickeables que traen un valor de referencia (saldo pendiente,
 * costo unitario de presupuesto, etc.) a un campo de monto — evita errores
 * de tipeo de centavos. UI-only; el valor insertado es exacto (D-053).
 */
export function FillableAmount({ suggestions, onPick, toastOnPick, className }: Props) {
  if (suggestions.length === 0) return null;

  function handlePick(s: AmountSuggestion) {
    if (s.disabled) return;
    onPick(s.amount, s);
    if (toastOnPick) {
      const message =
        typeof toastOnPick === "function"
          ? toastOnPick(s)
          : `${s.label} completado en el campo.`;
      toast.success(message);
    }
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {suggestions.map((s, i) => {
        const shown = s.display ?? formatMoneyAmount(s.amount, s.currency);
        return (
          <button
            key={`${s.label}-${i}`}
            type="button"
            disabled={s.disabled}
            onClick={() => handlePick(s)}
            aria-label={`Usar ${s.label}: ${shown}`}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
              "disabled:cursor-not-allowed disabled:opacity-50",
              s.exceeds
                ? "border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/20"
                : "border-input bg-muted/40 text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            <span className="text-[10px] uppercase tracking-wide opacity-70">{s.label}</span>
            <span className="tabular-nums">{shown}</span>
          </button>
        );
      })}
    </div>
  );
}
