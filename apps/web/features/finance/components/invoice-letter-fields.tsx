"use client";

import {
  IVA_CONDITION_CODES,
  IVA_CONDITION_LABEL_ES,
  INVOICE_LETTER_CODES,
  INVOICE_LETTER_LABEL_ES,
  type IvaConditionCode,
  type InvoiceLetterCode,
} from "@bloqer/domain";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const NONE = "__none__";

export function IvaConditionSelect({
  id,
  name,
  value,
  onValueChange,
  label = "Condición frente al IVA",
  className,
  allowEmpty = true,
}: {
  id?: string;
  name?: string;
  value: IvaConditionCode | null | undefined;
  onValueChange: (value: IvaConditionCode | null) => void;
  label?: string;
  className?: string;
  allowEmpty?: boolean;
}) {
  const selectValue = value ?? (allowEmpty ? NONE : undefined);
  return (
    <div className={cn("space-y-2", className)}>
      {label ? <Label htmlFor={id}>{label}</Label> : null}
      {name ? (
        <input type="hidden" name={name} value={value ?? ""} />
      ) : null}
      <Select
        value={selectValue}
        onValueChange={(v) => {
          if (v === NONE) onValueChange(null);
          else onValueChange(v as IvaConditionCode);
        }}
      >
        <SelectTrigger id={id}>
          <SelectValue placeholder="Seleccionar condición" />
        </SelectTrigger>
        <SelectContent>
          {allowEmpty ? (
            <SelectItem value={NONE}>Sin especificar</SelectItem>
          ) : null}
          {IVA_CONDITION_CODES.map((code) => (
            <SelectItem key={code} value={code}>
              {IVA_CONDITION_LABEL_ES[code]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function InvoiceLetterSelect({
  id,
  name,
  value,
  onValueChange,
  label = "Tipo de factura",
  hint,
  className,
  required,
}: {
  id?: string;
  name?: string;
  value: InvoiceLetterCode | null | undefined;
  onValueChange: (value: InvoiceLetterCode | null) => void;
  label?: string;
  hint?: string | null;
  className?: string;
  required?: boolean;
}) {
  const selectValue = value ?? (required ? undefined : NONE);
  return (
    <div className={cn("space-y-2", className)}>
      {label ? (
        <Label htmlFor={id}>
          {label}
          {required ? " *" : ""}
        </Label>
      ) : null}
      {name ? <input type="hidden" name={name} value={value ?? ""} /> : null}
      <Select
        value={selectValue}
        onValueChange={(v) => {
          if (v === NONE) onValueChange(null);
          else onValueChange(v as InvoiceLetterCode);
        }}
      >
        <SelectTrigger id={id}>
          <SelectValue placeholder="Seleccionar letra" />
        </SelectTrigger>
        <SelectContent>
          {required ? null : <SelectItem value={NONE}>Sin especificar</SelectItem>}
          {INVOICE_LETTER_CODES.map((code) => (
            <SelectItem key={code} value={code}>
              {INVOICE_LETTER_LABEL_ES[code]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function invoiceLetterHint(letter: InvoiceLetterCode | null | undefined): string | null {
  switch (letter) {
    case "A":
      return "IVA discriminado. Suele usar alícuota 21% (crédito fiscal para RI).";
    case "B":
      return "IVA incluido en el precio. No genera crédito fiscal al receptor.";
    case "C":
      return "Sin IVA (emisor Monotributo o Exento).";
    case "E":
      return "Exportación: sin IVA.";
    default:
      return null;
  }
}

export function formatIvaConditionLabel(
  code: string | null | undefined,
): string {
  if (!code) return "—";
  if ((IVA_CONDITION_CODES as string[]).includes(code)) {
    return IVA_CONDITION_LABEL_ES[code as IvaConditionCode];
  }
  return code;
}

export function formatInvoiceLetterBadge(
  letter: string | null | undefined,
): string | null {
  if (!letter) return null;
  if ((INVOICE_LETTER_CODES as string[]).includes(letter)) {
    return INVOICE_LETTER_LABEL_ES[letter as InvoiceLetterCode];
  }
  return `Factura ${letter}`;
}
