"use client";

/**
 * Combobox con búsqueda para catálogos largos o dinámicos (contactos, WBS, plan de cuentas, productos, proyectos).
 * Para enums o listas fijas cortas (≤ ~8 opciones) usar `Select` (tipo de cuenta, moneda, severidad, modo GG, etc.).
 */

import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type SearchableComboboxOption = {
  value: string;
  label: string;
  /** Texto extra para filtrar (ej. razón social + nombre fantasía). */
  searchValue?: string;
};

type SearchableComboboxProps = {
  options: SearchableComboboxOption[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
  /** Si true, volver a elegir la opción activa la deselecciona. */
  allowClear?: boolean;
};

export function SearchableCombobox({
  options,
  value,
  onValueChange,
  placeholder = "Seleccionar…",
  searchPlaceholder = "Buscar…",
  emptyText = "Sin resultados.",
  disabled,
  className,
  id,
  allowClear = false,
}: SearchableComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "h-10 w-full justify-between px-3 font-normal",
            !selected && "text-muted-foreground",
            className,
          )}
        >
          <span className="truncate">{selected?.label ?? placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command
          filter={(itemValue, search) => {
            if (!search.trim()) return 1;
            return itemValue.toLowerCase().includes(search.trim().toLowerCase()) ? 1 : 0;
          }}
        >
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.searchValue ?? option.label}
                  onSelect={() => {
                    const next =
                      allowClear && option.value === value ? "" : option.value;
                    onValueChange(next);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4 shrink-0",
                      value === option.value ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="truncate">{option.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** Convierte opciones `{ id, label }` del directorio / AP / ventas. */
export function toSearchableOptions(
  items: { id: string; label: string }[],
): SearchableComboboxOption[] {
  return items.map((item) => ({
    value: item.id,
    label: item.label,
    searchValue: item.label,
  }));
}

/** Contactos con fantasy + legal name para búsqueda. */
export function contactsToSearchableOptions(
  contacts: { id: string; fantasyName?: string | null; legalName: string }[],
): SearchableComboboxOption[] {
  return contacts.map((c) => {
    const primary = c.fantasyName ?? c.legalName;
    const secondary = c.fantasyName && c.fantasyName !== c.legalName ? c.legalName : null;
    return {
      value: c.id,
      label: primary,
      searchValue: secondary ? `${primary} ${secondary}` : primary,
    };
  });
}

/** Valor interno para opción vacía en campos opcionales (WBS, OC, depósito, etc.). */
export const SEARCHABLE_NONE = "__none__";

export function withNoneOption(
  options: SearchableComboboxOption[],
  none: { label: string; value?: string } = { label: "Sin asignación" },
): SearchableComboboxOption[] {
  const value = none.value ?? SEARCHABLE_NONE;
  return [{ value, label: none.label, searchValue: none.label }, ...options];
}

export function wbsToSearchableOptions(
  items: { id: string; code: string; name: string; budgetName?: string; unit?: string }[],
): SearchableComboboxOption[] {
  return items.map((w) => {
    let label = `${w.code} — ${w.name}`;
    if (w.unit) label += ` (${w.unit})`;
    if (w.budgetName) label += ` (${w.budgetName})`;
    return {
      value: w.id,
      label,
      searchValue: `${w.code} ${w.name} ${w.unit ?? ""} ${w.budgetName ?? ""}`,
    };
  });
}

export function productsToSearchableOptions(
  items: { id: string; sku: string; name: string }[],
): SearchableComboboxOption[] {
  return items.map((p) => ({
    value: p.id,
    label: `[${p.sku}] ${p.name}`,
    searchValue: `${p.sku} ${p.name}`,
  }));
}

export function chartAccountsToSearchableOptions(
  accounts: { id: string; code: string; name: string }[],
): SearchableComboboxOption[] {
  return accounts.map((a) => ({
    value: a.id,
    label: `${a.code} — ${a.name}`,
    searchValue: `${a.code} ${a.name}`,
  }));
}

export function projectsToSearchableOptions(
  projects: { id: string; code: string; name: string; currency?: string }[],
): SearchableComboboxOption[] {
  return projects.map((p) => ({
    value: p.id,
    label: p.currency ? `${p.code} — ${p.name} (${p.currency})` : `${p.code} — ${p.name}`,
    searchValue: `${p.code} ${p.name}`,
  }));
}
