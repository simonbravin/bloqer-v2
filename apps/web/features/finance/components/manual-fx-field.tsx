"use client";

import { DecimalInput } from "@/components/ui/decimal-input";
import { Label } from "@/components/ui/label";

/** D-008: one explicit rate per document or collection, ARS per foreign unit. */
export function ManualFxField({
  currency,
  value,
  onValueChange,
  id = "manual-fx",
  disabled = false,
}: {
  currency: string;
  value: string;
  onValueChange: (value: string) => void;
  id?: string;
  disabled?: boolean;
}) {
  if (currency === "ARS") return null;
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>Tipo de cambio · ARS por 1 {currency}</Label>
      <DecimalInput
        id={id}
        value={value}
        onValueChange={onValueChange}
        scale={6}
        required
        disabled={disabled}
      />
      <p className="text-xs text-muted-foreground">
        Ingresá la cotización de esta operación. Se conserva el monto en {currency} y su equivalente
        en pesos para los reportes.
      </p>
    </div>
  );
}
