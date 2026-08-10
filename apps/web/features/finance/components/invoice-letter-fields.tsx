"use client";

import {
  IVA_CONDITION_CODES,
  IVA_CONDITION_LABEL_ES,
  INVOICE_LETTER_CODES,
  INVOICE_LETTER_LABEL_ES,
  IVA_RATE_PRESETS,
  IVA_RATE_LABEL_ES,
  IVA_RATE_CONSTRUCTION_HINT_ES,
  normalizeIvaRatePreset,
  type IvaConditionCode,
  type InvoiceLetterCode,
} from "@bloqer/domain";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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

/** Factura B / precio final ([D-086]). */
export function PricesIncludeTaxCheckbox({
  id = "pricesIncludeTax",
  checked,
  onCheckedChange,
  className,
  editModeHint,
}: {
  id?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  className?: string;
  /** When editing DRAFT: stored unit prices are already net. */
  editModeHint?: boolean;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-start gap-2">
        <Checkbox
          id={id}
          checked={checked}
          onCheckedChange={(v) => onCheckedChange(v === true)}
          className="mt-0.5"
        />
        <div className="space-y-0.5">
          <Label htmlFor={id} className="font-normal leading-snug cursor-pointer">
            El precio unitario incluye IVA
          </Label>
          <p className="text-xs text-muted-foreground">
            {editModeHint
              ? "Los precios ya guardados son netos. Activá solo si reingresás un precio final con IVA."
              : "Típico en Factura B: el total de línea es cantidad × precio ingresado; el sistema calcula neto e IVA."}
          </p>
        </div>
      </div>
    </div>
  );
}

export function TaxRateSelect({
  id,
  value,
  onValueChange,
  label = "Alícuota IVA (%)",
  className,
  showConstructionHint,
}: {
  id?: string;
  value: string;
  onValueChange: (value: string) => void;
  label?: string;
  className?: string;
  showConstructionHint?: boolean;
}) {
  const preset = normalizeIvaRatePreset(value);
  return (
    <div className={cn("space-y-2", className)}>
      {label ? <Label htmlFor={id}>{label}</Label> : null}
      <Select value={preset ?? undefined} onValueChange={onValueChange}>
        <SelectTrigger id={id}>
          <SelectValue placeholder={value || "Seleccionar alícuota"} />
        </SelectTrigger>
        <SelectContent>
          {IVA_RATE_PRESETS.map((rate) => (
            <SelectItem key={rate} value={rate}>
              {IVA_RATE_LABEL_ES[rate]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {!preset && value ? (
        <p className="text-xs text-muted-foreground">Alícuota personalizada: {value}%</p>
      ) : null}
      {showConstructionHint ? (
        <p className="text-xs text-muted-foreground">{IVA_RATE_CONSTRUCTION_HINT_ES}</p>
      ) : null}
    </div>
  );
}
