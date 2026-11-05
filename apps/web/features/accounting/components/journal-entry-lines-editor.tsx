"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DecimalInput } from "@/components/ui/decimal-input";
import { Label } from "@/components/ui/label";
import { CurrencySelect } from "@/components/ui/currency-select";
import { SearchableCombobox } from "@/components/ui/searchable-combobox";
import { chartAccountsToSearchableOptions } from "@/lib/searchable-options";
import {
  createEmptyJournalLine,
  type AccountPick,
  type LineEditorRow,
} from "../lib/journal-entry-lines";

export type { AccountPick, LineEditorRow };

interface Props {
  accounts: AccountPick[];
  lines:    LineEditorRow[];
  onChange: (lines: LineEditorRow[]) => void;
  /** Sourced DRAFT: lock amounts/currency/structure; allow account + line text [D-063]. */
  sourcedLock?: boolean;
}

export function JournalEntryLinesEditor({
  accounts,
  lines,
  onChange,
  sourcedLock = false,
}: Props) {
  const accountOptions = React.useMemo(
    () => chartAccountsToSearchableOptions(accounts),
    [accounts],
  );

  function update(idx: number, patch: Partial<LineEditorRow>) {
    if (sourcedLock) {
      const { debit: _d, credit: _c, currency: _cur, ...safe } = patch;
      void _d;
      void _c;
      void _cur;
      if (Object.keys(safe).length === 0) return;
      const next = lines.map((l, i) => (i === idx ? { ...l, ...safe } : l));
      onChange(next);
      return;
    }
    const next = lines.map((l, i) => (i === idx ? { ...l, ...patch } : l));
    onChange(next);
  }

  function addRow() {
    if (sourcedLock) return;
    onChange([...lines, createEmptyJournalLine(lines[0]?.currency ?? "ARS")]);
  }

  function removeRow(idx: number) {
    if (sourcedLock || lines.length <= 2) return;
    onChange(lines.filter((_, i) => i !== idx));
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>Líneas (mínimo 2)</Label>
        {!sourcedLock ? (
          <Button type="button" variant="outline" size="sm" onClick={addRow}>
            + Línea
          </Button>
        ) : null}
      </div>
      {sourcedLock ? (
        <p className="text-xs text-muted-foreground">
          Montos tomados del documento origen; solo podés ajustar cuentas y textos.
        </p>
      ) : null}
      <div className="space-y-4 rounded-md border p-4">
        {lines.map((line, idx) => (
          <div key={line.key} className="grid gap-3 border-b pb-4 last:border-0 last:pb-0 sm:grid-cols-2 xl:grid-cols-12" role="group" aria-label={`Línea ${idx + 1}`}>
            <div className="space-y-1 sm:col-span-2 xl:col-span-4">
              <Label htmlFor={`journal-account-${idx}`} className="text-xs text-muted-foreground">Cuenta</Label>
              <SearchableCombobox
                id={`journal-account-${idx}`}
                options={accountOptions}
                value={line.accountId}
                onValueChange={(v) => update(idx, { accountId: v })}
                placeholder="Seleccionar cuenta…"
                searchPlaceholder="Buscar por código o nombre…"
                emptyText="Ninguna cuenta coincide."
                className="h-9"
              />
            </div>
            <div className="space-y-1 xl:col-span-2">
              <Label htmlFor={`journal-debit-${idx}`} className="text-xs text-muted-foreground">Debe</Label>
              <DecimalInput
                id={`journal-debit-${idx}`}
                className="font-mono"
                value={line.debit}
                onValueChange={(debit) => update(idx, { debit })}
                placeholder="0"
                disabled={sourcedLock}
                readOnly={sourcedLock}
              />
            </div>
            <div className="space-y-1 xl:col-span-2">
              <Label htmlFor={`journal-credit-${idx}`} className="text-xs text-muted-foreground">Haber</Label>
              <DecimalInput
                id={`journal-credit-${idx}`}
                className="font-mono"
                value={line.credit}
                onValueChange={(credit) => update(idx, { credit })}
                placeholder="0"
                disabled={sourcedLock}
                readOnly={sourcedLock}
              />
            </div>
            <div className="min-w-0 space-y-1 xl:col-span-3">
              <Label htmlFor={`journal-currency-${idx}`} className="text-xs text-muted-foreground">Moneda</Label>
              <CurrencySelect
                id={`journal-currency-${idx}`}
                value={line.currency || "ARS"}
                onValueChange={(currency) => update(idx, { currency })}
                triggerClassName="h-9 min-w-0"
                disabled={sourcedLock}
              />
            </div>
            <div className="flex items-end xl:col-span-1">
              {!sourcedLock ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeRow(idx)}
                  disabled={lines.length <= 2}
                  aria-label={`Quitar línea ${idx + 1}`}
                >
                  Quitar
                </Button>
              ) : null}
            </div>
            <div className="space-y-1 sm:col-span-2 xl:col-span-12">
              <Label htmlFor={`journal-description-${idx}`} className="text-xs text-muted-foreground">Detalle línea (opcional)</Label>
              <Input
                id={`journal-description-${idx}`}
                value={line.description}
                onChange={(e) => update(idx, { description: e.target.value })}
                maxLength={512}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
