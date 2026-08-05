"use client";

import { useEffect, useMemo, useState } from "react";
import {
  addDecimal,
  divideDecimal,
  multiplyDecimal,
  roundMoney,
} from "@bloqer/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDecimalArFromString } from "@/lib/format-money";
import {
  SearchableCombobox,
  SEARCHABLE_NONE,
  wbsToSearchableOptions,
} from "@/components/ui/searchable-combobox";

export type InvoiceLine = {
  description: string;
  quantity: string;
  unitPrice: string;
  taxRate: string;
  wbsNodeId?: string | null;
  /** Set when line comes from OC draft ([D-066]); kept for submit. */
  purchaseOrderLineId?: string | null;
};

export type InvoiceWbsOption = {
  id: string;
  code: string;
  name: string;
};

function createLineKey(): string {
  return crypto.randomUUID();
}

function safeDecimal(v: string): string {
  const t = v.trim();
  if (!t || !/^-?\d+(\.\d+)?$/.test(t) || t.startsWith("-")) return "0";
  return t;
}

/** Client preview aligned with server calcLine [D-053] (round each money component). */
function linePreview(l: InvoiceLine) {
  const qty = safeDecimal(l.quantity);
  const price = safeDecimal(l.unitPrice);
  const rate = safeDecimal(l.taxRate);
  const subtotal = roundMoney(multiplyDecimal(qty, price));
  const tax = roundMoney(divideDecimal(multiplyDecimal(subtotal, rate), "100"));
  const total = roundMoney(addDecimal(subtotal, tax));
  return { subtotal, tax, total };
}

interface Props {
  lines: InvoiceLine[];
  onChange: (lines: InvoiceLine[]) => void;
  /** When set, each line must pick a WBS ITEM ([D-055]). */
  requireWbs?: boolean;
  wbsOptions?: InvoiceWbsOption[];
}

export function InvoiceLinesEditor({
  lines,
  onChange,
  requireWbs = false,
  wbsOptions = [],
}: Props) {
  const wbsCombobox = useMemo(() => wbsToSearchableOptions(wbsOptions), [wbsOptions]);
  const [lineKeys, setLineKeys] = useState<string[]>(() =>
    Array.from({ length: Math.max(lines.length, 1) }, createLineKey),
  );

  // Keep React keys aligned when the parent replaces lines (PO import, form reset, etc.).
  useEffect(() => {
    setLineKeys((prev) => {
      if (prev.length === lines.length) return prev;
      if (lines.length > prev.length) {
        return [
          ...prev,
          ...Array.from({ length: lines.length - prev.length }, createLineKey),
        ];
      }
      if (lines.length <= 1) return [createLineKey()];
      return prev.slice(0, lines.length);
    });
  }, [lines.length]);

  function update(i: number, field: keyof InvoiceLine, value: string | null) {
    const next = lines.map((l, idx) => {
      if (idx !== i) return l;
      const patched: InvoiceLine = { ...l, [field]: value };
      // Changing EDT breaks the OC-line link only when the partida actually changes ([D-066]).
      if (field === "wbsNodeId" && value !== l.wbsNodeId) {
        patched.purchaseOrderLineId = null;
      }
      return patched;
    });
    onChange(next);
  }

  function addLine() {
    setLineKeys((keys) => [...keys, createLineKey()]);
    onChange([
      ...lines,
      { description: "", quantity: "1", unitPrice: "", taxRate: "21", wbsNodeId: null, purchaseOrderLineId: null },
    ]);
  }

  function removeLine(i: number) {
    if (lines.length <= 1) return;
    setLineKeys((keys) => keys.filter((_, idx) => idx !== i));
    onChange(lines.filter((_, idx) => idx !== i));
  }

  const totals = lines.reduce(
    (acc, l) => {
      const p = linePreview(l);
      return {
        subtotal: roundMoney(addDecimal(acc.subtotal, p.subtotal)),
        tax: roundMoney(addDecimal(acc.tax, p.tax)),
        total: roundMoney(addDecimal(acc.total, p.total)),
      };
    },
    { subtotal: "0.00", tax: "0.00", total: "0.00" },
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Líneas</p>
        <Button type="button" variant="outline" size="sm" onClick={addLine}>
          + Agregar línea
        </Button>
      </div>

      <div className="space-y-3">
        {lines.map((line, i) => {
          const lineKey = lineKeys[i] ?? String(i);
          const p = linePreview(line);
          const descriptionId = `invoice-line-${lineKey}-description`;
          const quantityId = `invoice-line-${lineKey}-quantity`;
          const unitPriceId = `invoice-line-${lineKey}-unit-price`;
          const taxRateId = `invoice-line-${lineKey}-tax-rate`;
          const wbsId = `invoice-line-${lineKey}-wbs`;

          return (
            <section
              key={lineKey}
              aria-label={`Línea ${i + 1}`}
              className="form-section p-3 space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-medium text-muted-foreground">Línea {i + 1}</p>
                {lines.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeLine(i)}
                    className="text-muted-foreground hover:text-destructive text-xs"
                    aria-label={`Eliminar línea ${i + 1}`}
                  >
                    ✕
                  </button>
                )}
              </div>

              {requireWbs ? (
                <div className="space-y-1">
                  <Label htmlFor={wbsId} className="text-xs">
                    Partida EDT (obligatorio)
                  </Label>
                  <SearchableCombobox
                    id={wbsId}
                    popoverWidth="wide"
                    options={wbsCombobox}
                    value={line.wbsNodeId ?? ""}
                    onValueChange={(v) =>
                      update(i, "wbsNodeId", !v || v === SEARCHABLE_NONE ? null : v)
                    }
                    placeholder="Partida…"
                    searchPlaceholder="Buscar partida…"
                    emptyText="Sin partidas"
                    className="h-9 text-xs"
                  />
                </div>
              ) : null}

              <div className="space-y-1">
                <Label htmlFor={descriptionId} className="text-xs">
                  Descripción
                </Label>
                <Input
                  id={descriptionId}
                  required
                  value={line.description}
                  onChange={(e) => update(i, "description", e.target.value)}
                  placeholder="Descripción del ítem"
                  className="h-9 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <div className="space-y-1 min-w-0">
                  <Label htmlFor={quantityId} className="text-xs">
                    Cantidad
                  </Label>
                  <Input
                    id={quantityId}
                    required
                    value={line.quantity}
                    onChange={(e) => update(i, "quantity", e.target.value)}
                    placeholder="1"
                    inputMode="decimal"
                    className="h-9 text-sm tabular-nums"
                  />
                </div>
                <div className="space-y-1 min-w-0">
                  <Label htmlFor={unitPriceId} className="text-xs">
                    Precio unit.
                  </Label>
                  <Input
                    id={unitPriceId}
                    required
                    value={line.unitPrice}
                    onChange={(e) => update(i, "unitPrice", e.target.value)}
                    placeholder="0.00"
                    inputMode="decimal"
                    className="h-9 text-sm tabular-nums"
                  />
                </div>
                <div className="space-y-1 min-w-0">
                  <Label htmlFor={taxRateId} className="text-xs">
                    IVA %
                  </Label>
                  <Input
                    id={taxRateId}
                    value={line.taxRate}
                    onChange={(e) => update(i, "taxRate", e.target.value)}
                    placeholder="21"
                    inputMode="decimal"
                    className="h-9 text-sm tabular-nums"
                  />
                </div>
                <div className="space-y-1 min-w-0">
                  <Label className="text-xs">Subtotal</Label>
                  <p className="flex h-9 items-center text-sm tabular-nums text-muted-foreground">
                    {formatDecimalArFromString(p.subtotal)}
                  </p>
                </div>
                <div className="space-y-1 min-w-0">
                  <Label className="text-xs">IVA</Label>
                  <p className="flex h-9 items-center text-sm tabular-nums text-muted-foreground">
                    {formatDecimalArFromString(p.tax)}
                  </p>
                </div>
                <div className="space-y-1 min-w-0">
                  <Label className="text-xs">Total</Label>
                  <p className="flex h-9 items-center text-sm tabular-nums font-semibold">
                    {formatDecimalArFromString(p.total)}
                  </p>
                </div>
              </div>
            </section>
          );
        })}
      </div>

      <div className="flex flex-wrap justify-end gap-x-8 gap-y-2 border-t pt-3 text-sm">
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Subtotal</p>
          <p className="tabular-nums font-medium">{formatDecimalArFromString(totals.subtotal)}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">IVA</p>
          <p className="tabular-nums font-medium">{formatDecimalArFromString(totals.tax)}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground font-semibold">Total (vista previa)</p>
          <p className="tabular-nums font-semibold">{formatDecimalArFromString(totals.total)}</p>
        </div>
      </div>
      {requireWbs && wbsOptions.length === 0 ? (
        <p className="text-xs text-destructive" role="alert">
          No hay partidas EDT disponibles. Aprobá un presupuesto con ítems WBS antes de
          cargar la factura.
        </p>
      ) : null}
      {requireWbs ? (
        <p className="text-xs text-muted-foreground">
          Cada línea de factura de proyecto debe imputar a una partida EDT. Los totales son
          una vista previa; el servidor recalcula al guardar.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Los totales son una vista previa. El servidor recalcula al guardar.
        </p>
      )}
    </div>
  );
}
