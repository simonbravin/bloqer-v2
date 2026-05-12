"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

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
}

export function JournalEntryLinesEditor({ accounts, lines, onChange }: Props) {
  function update(idx: number, patch: Partial<LineEditorRow>) {
    const next = lines.map((l, i) => (i === idx ? { ...l, ...patch } : l));
    onChange(next);
  }

  function addRow() {
    onChange([...lines, newRow()]);
  }

  function removeRow(idx: number) {
    if (lines.length <= 2) return;
    onChange(lines.filter((_, i) => i !== idx));
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>Líneas (mínimo 2)</Label>
        <Button type="button" variant="outline" size="sm" onClick={addRow}>+ Línea</Button>
      </div>
      <div className="space-y-4 rounded-md border p-4">
        {lines.map((line, idx) => (
          <div key={line.key} className="grid gap-3 border-b pb-4 last:border-0 last:pb-0 sm:grid-cols-12">
            <div className="sm:col-span-4 space-y-1">
              <Label className="text-xs text-muted-foreground">Cuenta</Label>
              <Select
                value={line.accountId || undefined}
                onValueChange={(v) => update(idx, { accountId: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar…" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.code} — {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2 space-y-1">
              <Label className="text-xs text-muted-foreground">Debe</Label>
              <Input
                className="font-mono"
                value={line.debit}
                onChange={(e) => update(idx, { debit: e.target.value })}
                placeholder="0"
              />
            </div>
            <div className="sm:col-span-2 space-y-1">
              <Label className="text-xs text-muted-foreground">Haber</Label>
              <Input
                className="font-mono"
                value={line.credit}
                onChange={(e) => update(idx, { credit: e.target.value })}
                placeholder="0"
              />
            </div>
            <div className="sm:col-span-2 space-y-1">
              <Label className="text-xs text-muted-foreground">Moneda</Label>
              <Input
                className="font-mono"
                value={line.currency}
                onChange={(e) => update(idx, { currency: e.target.value.toUpperCase() })}
                maxLength={8}
              />
            </div>
            <div className="sm:col-span-1 flex items-end">
              <Button type="button" variant="ghost" size="sm" onClick={() => removeRow(idx)} disabled={lines.length <= 2}>
                Quitar
              </Button>
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
