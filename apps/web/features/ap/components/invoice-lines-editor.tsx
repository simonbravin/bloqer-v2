"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  addDecimal,
  normalizeDiscountPct,
  roundMoney,
  resolveDocumentLineAmounts,
} from "@bloqer/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DecimalInput } from "@/components/ui/decimal-input";
import { Label } from "@/components/ui/label";
import { formatDecimalArFromString } from "@/lib/format-money";
import { SearchableCombobox } from "@/components/ui/searchable-combobox";
import { SEARCHABLE_NONE, wbsToSearchableOptions } from "@/lib/searchable-options";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { IVA_RATE_PRESETS, IVA_RATE_LABEL_ES, normalizeIvaRatePreset } from "@bloqer/domain";
import { COST_CATEGORY_OPTIONS, type CostCategoryOptionValue } from "@/lib/cost-category-colors";

export type InvoiceLine = {
  description: string;
  quantity: string;
  unitPrice: string;
  taxRate: string;
  discountPct: string;
  wbsNodeId?: string | null;
  /** Set when line comes from OC draft ([D-066]); kept for submit. */
  purchaseOrderLineId?: string | null;
  /** Optional APU hint ([D-110]); cleared when partida changes. */
  costAnalysisLineId?: string | null;
  /** Job-cost nature ([D-099]). */
  costType?: CostCategoryOptionValue | null;
};

export type InvoiceWbsOption = {
  id: string;
  code: string;
  name: string;
  /** APU-derived dominant CostCategory used to pre-select `costType` ([D-099]). */
  dominantCostType?: CostCategoryOptionValue | null;
};

function createLineKey(): string {
  return crypto.randomUUID();
}

function safeDecimal(v: string): string {
  const t = v.trim();
  if (!t || !/^-?\d+(\.\d+)?$/.test(t) || t.startsWith("-")) return "0";
  return t;
}

const EMPTY_LINE: InvoiceLine = {
  description: "",
  quantity: "1",
  unitPrice: "",
  taxRate: "21",
  discountPct: "0",
  wbsNodeId: null,
  purchaseOrderLineId: null,
  costAnalysisLineId: null,
  costType: "MATERIAL",
};

/** Client preview aligned with UI 2 dp display ([D-053] / [D-086] / [D-093]). */
function linePreview(l: InvoiceLine, pricesIncludeTax: boolean) {
  try {
    const r = resolveDocumentLineAmounts({
      quantity: safeDecimal(l.quantity),
      unitPrice: safeDecimal(l.unitPrice),
      taxRatePercent: safeDecimal(l.taxRate),
      discountPct: safeDecimal(l.discountPct ?? "0"),
      pricesIncludeTax,
    });
    return { subtotal: r.lineSubtotal, tax: r.lineTax, total: r.lineTotal };
  } catch {
    return { subtotal: "0.00", tax: "0.00", total: "0.00" };
  }
}

interface Props {
  lines: InvoiceLine[];
  onChange: (lines: InvoiceLine[]) => void;
  /** When set, each line must pick a WBS ITEM ([D-055]). */
  requireWbs?: boolean;
  wbsOptions?: InvoiceWbsOption[];
  /** Factura B: unit price is gross ([D-086]). */
  pricesIncludeTax?: boolean;
  /**
   * Treat the first line's costType as user-chosen so changing partida does not
   * restomp LABOR/EQUIPMENT prefill from Mano de obra / Equipos ([D-099]).
   */
  seedFirstLineCostTypeAsManual?: boolean;
}

export function InvoiceLinesEditor({
  lines,
  onChange,
  requireWbs = false,
  wbsOptions = [],
  pricesIncludeTax = false,
  seedFirstLineCostTypeAsManual = false,
}: Props) {
  const wbsCombobox = useMemo(() => wbsToSearchableOptions(wbsOptions), [wbsOptions]);
  const [headerDiscount, setHeaderDiscount] = useState("");
  const [{ lineKeys, manualCostTypeKeys }, setLineState] = useState(() => {
    const keys = Array.from({ length: Math.max(lines.length, 1) }, createLineKey);
    const manual =
      seedFirstLineCostTypeAsManual && keys[0]
        ? new Set<string>([keys[0]!])
        : new Set<string>();
    return { lineKeys: keys, manualCostTypeKeys: manual };
  });

  function setLineKeys(updater: (prev: string[]) => string[]) {
    setLineState((prev) => ({ ...prev, lineKeys: updater(prev.lineKeys) }));
  }

  function setManualCostTypeKeys(updater: (prev: Set<string>) => Set<string>) {
    setLineState((prev) => ({
      ...prev,
      manualCostTypeKeys: updater(prev.manualCostTypeKeys),
    }));
  }

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
      // Preserve existing keys (incl. manual costType seed) when shrinking.
      return prev.slice(0, Math.max(lines.length, 1));
    });
  }, [lines.length]);
  function update(i: number, field: keyof InvoiceLine, value: string | null) {
    const lineKey = lineKeys[i] ?? String(i);
    const next = lines.map((l, idx) => {
      if (idx !== i) return l;
      const patched: InvoiceLine = { ...l, [field]: value };
      // Changing EDT breaks the OC-line link only when the partida actually changes ([D-066]).
      if (field === "wbsNodeId" && value !== l.wbsNodeId) {
        patched.purchaseOrderLineId = null;
        patched.costAnalysisLineId = null;
        // Auto-type from APU dominant when the user has not overridden `costType`.
        if (!manualCostTypeKeys.has(lineKey)) {
          const wbs = wbsOptions.find((w) => w.id === value);
          const dominant = wbs?.dominantCostType ?? null;
          patched.costType = dominant && COST_CATEGORY_OPTIONS.some((o) => o.value === dominant)
            ? dominant
            : "MATERIAL";
        }
      }
      return patched;
    });
    onChange(next);
  }

  function updateCostType(i: number, value: CostCategoryOptionValue) {
    const lineKey = lineKeys[i] ?? String(i);
    setManualCostTypeKeys((prev) => {
      if (prev.has(lineKey)) return prev;
      const next = new Set(prev);
      next.add(lineKey);
      return next;
    });
    onChange(lines.map((l, idx) => (idx === i ? { ...l, costType: value } : l)));
  }

  function addLine() {
    setLineKeys((keys) => [...keys, createLineKey()]);
    onChange([
      ...lines,
      { ...EMPTY_LINE },
    ]);
  }

  function removeLine(i: number) {
    if (lines.length <= 1) return;
    const removedKey = lineKeys[i];
    setLineKeys((keys) => keys.filter((_, idx) => idx !== i));
    if (removedKey) {
      setManualCostTypeKeys((prev) => {
        if (!prev.has(removedKey)) return prev;
        const next = new Set(prev);
        next.delete(removedKey);
        return next;
      });
    }
    onChange(lines.filter((_, idx) => idx !== i));
  }

  const totals = lines.reduce(
    (acc, l) => {
      const p = linePreview(l, pricesIncludeTax);
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">Líneas</p>
        <div className="flex flex-wrap items-center gap-2">
          <Label htmlFor="invoice-header-discount" className="text-xs text-muted-foreground whitespace-nowrap">
            Descuento general %
          </Label>
          <DecimalInput
            id="invoice-header-discount"
            value={headerDiscount}
            onValueChange={setHeaderDiscount}
            placeholder="0"
            className="h-8 w-20 text-sm"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              if (headerDiscount.trim() === "") {
                toast.error("Ingresá un descuento entre 0 y 100");
                return;
              }
              try {
                const pct = normalizeDiscountPct(headerDiscount);
                onChange(lines.map((l) => ({ ...l, discountPct: pct })));
                toast.success("Descuento copiado a todas las líneas");
              } catch {
                toast.error("El descuento debe estar entre 0 y 100");
              }
            }}
          >
            Aplicar a todas
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={addLine}>
            + Agregar línea
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        El descuento % se aplica al subtotal de la línea, antes de IVA. El precio unitario de lista no cambia.
        «Descuento general %» copia el mismo porcentaje a todas las líneas.
      </p>

      <div className="space-y-3">
        {lines.map((line, i) => {
          const lineKey = lineKeys[i] ?? String(i);
          const p = linePreview(line, pricesIncludeTax);
          const descriptionId = `invoice-line-${lineKey}-description`;
          const quantityId = `invoice-line-${lineKey}-quantity`;
          const unitPriceId = `invoice-line-${lineKey}-unit-price`;
          const taxRateId = `invoice-line-${lineKey}-tax-rate`;
          const wbsId = `invoice-line-${lineKey}-wbs`;
          const selectedWbs = wbsOptions.find((w) => w.id === line.wbsNodeId);
          const showMixedCostTypeHint = Boolean(
            selectedWbs && selectedWbs.dominantCostType == null && line.wbsNodeId,
          );

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
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                  <div className="space-y-1">
                    <Label htmlFor={`invoice-line-${lineKey}-cost-type`} className="text-xs">
                      Tipo de costo
                    </Label>
                    <Select
                      value={line.costType ?? "MATERIAL"}
                      onValueChange={(v) => updateCostType(i, v as CostCategoryOptionValue)}
                    >
                      <SelectTrigger
                        id={`invoice-line-${lineKey}-cost-type`}
                        className="h-9 text-xs"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {COST_CATEGORY_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[10px] text-muted-foreground leading-snug">
                      {showMixedCostTypeHint
                        ? "Esta partida tiene varios tipos en su APU; elegí el correcto."
                        : "Se sugiere solo desde el APU de la partida. Cambialo para jornales, empleados o alquileres."}
                    </p>
                  </div>
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

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
                <div className="space-y-1 min-w-0">
                  <Label htmlFor={quantityId} className="text-xs">
                    Cantidad
                  </Label>
                  <DecimalInput
                    id={quantityId}
                    required
                    value={line.quantity}
                    onValueChange={(v) => update(i, "quantity", v)}
                    placeholder="1,00"
                    className="h-9 text-sm"
                  />
                </div>
                <div className="space-y-1 min-w-0">
                  <Label htmlFor={unitPriceId} className="text-xs">
                    {pricesIncludeTax ? "Precio unit. (c/IVA)" : "Precio unit."}
                  </Label>
                  <DecimalInput
                    id={unitPriceId}
                    required
                    value={line.unitPrice}
                    onValueChange={(v) => update(i, "unitPrice", v)}
                    placeholder="0,00"
                    className="h-9 text-sm"
                  />
                </div>
                <div className="space-y-1 min-w-0">
                  <Label htmlFor={`${lineKey}-discount`} className="text-xs">
                    Desc. %
                  </Label>
                  <DecimalInput
                    id={`${lineKey}-discount`}
                    value={line.discountPct ?? "0"}
                    onValueChange={(v) => update(i, "discountPct", v)}
                    placeholder="0"
                    className="h-9 text-sm"
                  />
                </div>
                <div className="space-y-1 min-w-0">
                  <Label htmlFor={taxRateId} className="text-xs">
                    IVA %
                  </Label>
                  <Select
                    value={normalizeIvaRatePreset(line.taxRate) ?? undefined}
                    onValueChange={(v) => update(i, "taxRate", v)}
                  >
                    <SelectTrigger id={taxRateId} className="h-9 text-sm">
                      <SelectValue placeholder={line.taxRate || "21"} />
                    </SelectTrigger>
                    <SelectContent>
                      {IVA_RATE_PRESETS.map((rate) => (
                        <SelectItem key={rate} value={rate}>
                          {IVA_RATE_LABEL_ES[rate]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
          No hay partidas EDT disponibles. Aprobá un presupuesto con ítems EDT antes de
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
