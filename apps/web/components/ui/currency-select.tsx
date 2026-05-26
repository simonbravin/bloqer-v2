"use client";

import { AMERICAS_CURRENCY_OPTIONS, formatCurrencyLabel } from "@bloqer/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type CurrencySelectProps = {
  value: string;
  onValueChange: (code: string) => void;
  id?: string;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
  placeholder?: string;
};

export function CurrencySelect({
  value,
  onValueChange,
  id,
  disabled,
  className,
  triggerClassName,
  placeholder = "Seleccionar moneda",
}: CurrencySelectProps) {
  return (
    <div className={className}>
      <Select value={value} onValueChange={onValueChange} disabled={disabled}>
        <SelectTrigger id={id} className={cn("w-full min-w-[12rem]", triggerClassName)}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {AMERICAS_CURRENCY_OPTIONS.map((c) => (
            <SelectItem key={c.code} value={c.code}>
              {formatCurrencyLabel(c.code)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

type CurrencyFilterSelectProps = {
  value: string;
  onValueChange: (code: string) => void;
  className?: string;
  triggerClassName?: string;
};

/** Filtros de reportes: permite “todas las monedas”. */
export function CurrencyFilterSelect({
  value,
  onValueChange,
  className,
  triggerClassName,
}: CurrencyFilterSelectProps) {
  return (
    <Select
      value={value || "_all"}
      onValueChange={(v) => onValueChange(v === "_all" ? "" : v)}
    >
      <SelectTrigger className={cn("w-[min(100%,14rem)]", triggerClassName)}>
        <SelectValue placeholder="Todas las monedas" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="_all">Todas las monedas</SelectItem>
        {AMERICAS_CURRENCY_OPTIONS.map((c) => (
          <SelectItem key={c.code} value={c.code}>
            {formatCurrencyLabel(c.code)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
