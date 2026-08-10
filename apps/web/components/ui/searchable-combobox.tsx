"use client";

/**
 * Combobox con búsqueda para catálogos largos o dinámicos (contactos, WBS, plan de cuentas, productos, proyectos).
 * Para enums o listas fijas cortas (≤ ~8 opciones) usar `Select` (tipo de cuenta, moneda, severidad, modo GG, etc.).
 *
 * Pure option mappers live in `@/lib/searchable-options` (not this file) so they stay server-safe.
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
import type { SearchableComboboxOption } from "@/lib/searchable-options";

export type { SearchableComboboxOption };

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
  /** Ancho del popover: «trigger» (default) o «wide» para catálogos largos en tablas angostas. */
  popoverWidth?: "trigger" | "wide";
  contentClassName?: string;
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
  popoverWidth = "trigger",
  contentClassName,
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
          title={selected?.label}
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
      <PopoverContent
        className={cn(
          popoverWidth === "wide"
            ? "min-w-[max(var(--radix-popover-trigger-width),28rem)] max-w-[min(36rem,90vw)] p-0"
            : "w-[var(--radix-popover-trigger-width)] p-0",
          contentClassName,
        )}
        align="start"
      >
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
                  <span className={cn(popoverWidth === "wide" ? "break-words whitespace-normal" : "truncate")}>
                    {option.label}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
