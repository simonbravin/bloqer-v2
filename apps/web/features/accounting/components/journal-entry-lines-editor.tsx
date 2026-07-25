"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CurrencySelect } from "@/components/ui/currency-select";
import {
  SearchableCombobox,
  chartAccountsToSearchableOptions,
} from "@/components/ui/searchable-combobox";

export interface LineEditorRow {
  key:         string;
  accountId:   string;
  debit:       string;
  credit:      string;
  currency:    string;
  description: string;
}

export interface AccountPick {
  id:   string;
  code: string;
  name: string;
}

function newRow(): LineEditorRow {
  return {
    key:         crypto.randomUUID(),
    accountId:   "",
    debit:       "0",
    credit:      "0",
    currency:    "ARS",
    description: "",
  };
}

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
    onChange([...lines, newRow()]);
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
          <div key={line.key} className="grid gap-3 border-b pb-4 last:border-0 last:pb-0 sm:grid-cols-12">
            <div className="sm:col-span-4 space-y-1">
              <Label className="text-xs text-muted-foreground">Cuenta</Label>
              <SearchableCombobox
                options={accountOptions}
                value={line.accountId}
                onValueChange={(v) => update(idx, { accountId: v })}
                placeholder="Seleccionar cuenta…"
                searchPlaceholder="Buscar por código o nombre…"
                emptyText="Ninguna cuenta coincide."
                className="h-9"
              />
            </div>
            <div className="sm:col-span-2 space-y-1">
              <Label className="text-xs text-muted-foreground">Debe</Label>
              <Input
                className="font-mono"
                value={line.debit}
                onChange={(e) => update(idx, { debit: e.target.value })}
                placeholder="0"
                disabled={sourcedLock}
                readOnly={sourcedLock}
              />
            </div>
            <div className="sm:col-span-2 space-y-1">
              <Label className="text-xs text-muted-foreground">Haber</Label>
              <Input
                className="font-mono"
                value={line.credit}
                onChange={(e) => update(idx, { credit: e.target.value })}
                placeholder="0"
                disabled={sourcedLock}
                readOnly={sourcedLock}
              />
            </div>
            <div className="sm:col-span-2 space-y-1">
              <Label className="text-xs text-muted-foreground">Moneda</Label>
              <CurrencySelect
                value={line.currency || "ARS"}
                onValueChange={(currency) => update(idx, { currency })}
                triggerClassName="h-9"
                disabled={sourcedLock}
              />
            </div>
            <div className="sm:col-span-1 flex items-end">
              {!sourcedLock ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeRow(idx)}
                  disabled={lines.length <= 2}
                >
                  Quitar
                </Button>
              ) : null}
            </div>
            <div className="sm:col-span-12 space-y-1">
              <Label className="text-xs text-muted-foreground">Detalle línea (opcional)</Label>
              <Input
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

export function initialJournalLines(): LineEditorRow[] {
  return [newRow(), newRow()];
}

export function linesFromJournalEntry(
  lines: { accountId: string; debit: string; credit: string; currency: string; description: string | null }[],
): LineEditorRow[] {
  return lines.map((l) => ({
    key:         crypto.randomUUID(),
    accountId:   l.accountId,
    debit:       l.debit,
    credit:      l.credit,
    currency:    l.currency,
    description: l.description ?? "",
  }));
}
