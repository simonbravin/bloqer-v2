"use client";

import { useMemo } from "react";
import { toast } from "sonner";
import { divideDecimal, roundQty, QTY_DECIMALS } from "@bloqer/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  SearchableCombobox,
  SEARCHABLE_NONE,
  productsToSearchableOptions,
  toSearchableOptions,
  withNoneOption,
  wbsToSearchableOptions,
} from "@/components/ui/searchable-combobox";
import { UnitSelect } from "@/features/budgets/components/unit-select";
import { budgetUnitLabel } from "@/lib/budget-units";
import { formatDecimalAr } from "@/lib/format-money";

export type PurchaseOrderLine = {
  wbsNodeId: string | null;
  productId: string | null;
  costAnalysisLineId: string | null;
  description: string;
  unit: string;
  quantity: string;
  unitPrice: string;
  taxRate: string;
  varianceJustification?: string | null;
};

export type WbsApuOption = {
  id: string;
  description: string;
  unit: string;
  unitCost: string;
  productId: string | null;
  /** Prefill qty = shortfall (need − ordered); null when unknown / non-purchasable. */
  quantity: string | null;
  needQty?: string | null;
  orderedQty?: string | null;
  shortfallQty?: string | null;
};

export type WbsOption = {
  id: string;
  code: string;
  name: string;
  budgetName: string;
  budgetUnitCost?: string | null;
  budgetUnit?: string | null;
  availableSaldo?: string | null;
  wouldExceedBudget?: boolean;
  apuLines?: WbsApuOption[];
};
export type ProductOption = { id: string; sku: string; name: string; unit: string };

function fmtQtyHint(raw: string | null | undefined): string {
  if (raw == null || raw === "") return "—";
  const t = raw.trim();
  if (!/^-?\d+(\.\d+)?$/.test(t)) return t;
  const [i, d = ""] = t.split(".");
  const trimmed = d.replace(/0+$/, "");
  return trimmed ? `${i}.${trimmed}` : i;
}

/** True when qty string is a finite number > 0 (avoid prefill 0). */
function isPositiveQty(raw: string | null | undefined): boolean {
  if (raw == null || raw === "") return false;
  const t = raw.trim();
  if (!/^-?\d+(\.\d+)?$/.test(t)) return false;
  const n = Number(t);
  return Number.isFinite(n) && n > 0;
}

function safeNum(v: string) {
  const n = parseFloat(v);
  return isNaN(n) || n < 0 ? 0 : n;
}

function linePreview(l: PurchaseOrderLine) {
  const qty = safeNum(l.quantity);
  const price = safeNum(l.unitPrice);
  const rate = safeNum(l.taxRate);
  const subtotal = qty * price;
  const tax = subtotal * (rate / 100);
  return { subtotal, tax, total: subtotal + tax };
}

interface Props {
  lines: PurchaseOrderLine[];
  onChange: (lines: PurchaseOrderLine[]) => void;
  wbsOptions: WbsOption[];
  productOptions?: ProductOption[];
  showVarianceJustification?: boolean;
}

const DEFAULT_LINE: PurchaseOrderLine = {
  wbsNodeId: null,
  productId: null,
  costAnalysisLineId: null,
  description: "",
  unit: "",
  quantity: "1",
  unitPrice: "",
  taxRate: "21",
};

export function PurchaseOrderLinesEditor({
  lines,
  onChange,
  wbsOptions,
  productOptions = [],
  showVarianceJustification = false,
}: Props) {
  const wbsComboboxOptions = useMemo(
    () => wbsToSearchableOptions(wbsOptions),
    [wbsOptions],
  );
  const productComboboxOptions = useMemo(
    () => withNoneOption(productsToSearchableOptions(productOptions), { label: "Sin producto" }),
    [productOptions],
  );

  function update(i: number, field: keyof PurchaseOrderLine, value: string | null) {
    const next = lines.map((l, idx) => {
      if (idx !== i) return l;
      const patched: PurchaseOrderLine = { ...l, [field]: value };
      if (field === "wbsNodeId") {
        patched.costAnalysisLineId = null;
      }
      return patched;
    });
    onChange(next);
  }

  function applyApuHint(i: number, line: PurchaseOrderLine, apuId: string | null, wbs?: WbsOption) {
    if (!apuId) {
      update(i, "costAnalysisLineId", null);
      return;
    }
    const apu = wbs?.apuLines?.find((a) => a.id === apuId);
    if (!apu) {
      update(i, "costAnalysisLineId", apuId);
      return;
    }
    const prefillQty = isPositiveQty(apu.quantity)
      ? fmtQtyHint(apu.quantity)
      : line.quantity;
    const next: PurchaseOrderLine = {
      ...line,
      costAnalysisLineId: apu.id,
      description: apu.description,
      unit: apu.unit,
      productId: apu.productId ?? line.productId,
      unitPrice: line.unitPrice.trim() ? line.unitPrice : apu.unitCost,
      quantity: prefillQty,
    };
    onChange(lines.map((l, idx) => (idx === i ? next : l)));
    const hint =
      apu.needQty != null || apu.orderedQty != null
        ? `Necesidad ${fmtQtyHint(apu.needQty)} · Pedido ${fmtQtyHint(apu.orderedQty)} · Faltante ${fmtQtyHint(apu.shortfallQty ?? apu.quantity)}`
        : `faltante ${fmtQtyHint(apu.quantity)}`;
    toast.success(`Insumo APU aplicado (${hint}). Podés ajustar cantidad y unidad.`);
  }

  /** Trae el costo unitario del presupuesto (APU) al campo Precio unit. */
  function fillBudgetUnitPrice(i: number, wbs?: WbsOption) {
    if (!wbs?.budgetUnitCost || safeNum(wbs.budgetUnitCost) <= 0) return;
    update(i, "unitPrice", wbs.budgetUnitCost);
    toast.success("Precio unitario completado con el referencial del presupuesto.");
  }

  /** Ajusta la cantidad para consumir el saldo disponible de la partida. */
  function consumePartidaSaldo(i: number, line: PurchaseOrderLine, wbs?: WbsOption) {
    if (wbs?.availableSaldo == null) return;
    if (safeNum(wbs.availableSaldo) <= 0) {
      toast.error("La partida no tiene saldo disponible para consumir.");
      return;
    }
    const price = line.unitPrice.trim() || wbs.budgetUnitCost || "";
    if (!price || safeNum(price) <= 0) {
      toast.error("Definí primero un precio unitario (o usá el referencial).");
      return;
    }
    let qty: string;
    try {
      qty = roundQty(divideDecimal(wbs.availableSaldo, price, QTY_DECIMALS));
    } catch {
      toast.error("No se pudo calcular la cantidad para el saldo de la partida.");
      return;
    }
    const next: PurchaseOrderLine = {
      ...line,
      unitPrice: line.unitPrice.trim() ? line.unitPrice : price,
      quantity: qty,
    };
    onChange(lines.map((l, idx) => (idx === i ? next : l)));
    toast.success("Cantidad ajustada para consumir el saldo de la partida.");
  }

  function addLine() {
    onChange([...lines, { ...DEFAULT_LINE }]);
  }

  function removeLine(i: number) {
    if (lines.length <= 1) return;
    onChange(lines.filter((_, idx) => idx !== i));
  }

  const totals = lines.reduce(
    (acc, l) => {
      const p = linePreview(l);
      return { subtotal: acc.subtotal + p.subtotal, tax: acc.tax + p.tax, total: acc.total + p.total };
    },
    { subtotal: 0, tax: 0, total: 0 },
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Líneas</p>
        <Button type="button" variant="outline" size="sm" onClick={addLine}>
          + Agregar línea
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Cada línea debe imputar a un ítem EDT. Para gastos generales usá la partida de
        indirectos del presupuesto.
      </p>

      <div className="space-y-3">
        {lines.map((line, i) => {
          const p = linePreview(line);
          const wbs = wbsOptions.find((w) => w.id === line.wbsNodeId);
          const selectedApu = wbs?.apuLines?.find((a) => a.id === line.costAnalysisLineId);
          return (
            <div key={i} className="rounded-lg border bg-card/40 p-3 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-medium text-muted-foreground">Línea {i + 1}</p>
                {lines.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeLine(i)}
                    className="text-muted-foreground hover:text-destructive text-xs"
                    aria-label="Eliminar línea"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Row 1: EDT + Insumo APU */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs">EDT (obligatorio)</Label>
                  <SearchableCombobox
                    popoverWidth="wide"
                    className="h-8 text-xs"
                    options={wbsComboboxOptions}
                    value={line.wbsNodeId ?? ""}
                    onValueChange={(v) => update(i, "wbsNodeId", v || null)}
                    placeholder="Elegir EDT…"
                    searchPlaceholder="Buscar partida…"
                  />
                  {wbs?.availableSaldo != null && (
                    <button
                      type="button"
                      onClick={() => consumePartidaSaldo(i, line, wbs)}
                      title="Ajustar la cantidad para consumir este saldo"
                      className={`block text-left text-[10px] underline decoration-dotted underline-offset-2 hover:opacity-80 ${
                        wbs.wouldExceedBudget ? "text-destructive" : "text-muted-foreground"
                      }`}
                    >
                      Saldo part.: {formatDecimalAr(Number(wbs.availableSaldo))}
                      {wbs.wouldExceedBudget ? " (alerta)" : ""}
                    </button>
                  )}
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Insumo APU</Label>
                  <SearchableCombobox
                    popoverWidth="wide"
                    className="h-8 text-xs"
                    options={withNoneOption(
                      toSearchableOptions(
                        (wbs?.apuLines ?? []).map((a) => ({
                          id: a.id,
                          label:
                            a.shortfallQty != null || a.quantity != null
                              ? `${a.description} (faltante ${fmtQtyHint(a.shortfallQty ?? a.quantity)} ${budgetUnitLabel(a.unit)})`
                              : `${a.description} (${budgetUnitLabel(a.unit)})`,
                        })),
                      ),
                      { label: "Sin insumo APU" },
                    )}
                    value={line.costAnalysisLineId ?? SEARCHABLE_NONE}
                    onValueChange={(v) =>
                      applyApuHint(i, line, !v || v === SEARCHABLE_NONE ? null : v, wbs)
                    }
                    placeholder="Opcional…"
                    searchPlaceholder="Buscar insumo…"
                    disabled={!line.wbsNodeId || !(wbs?.apuLines?.length)}
                  />
                  {selectedApu ? (
                    <p className="text-[10px] text-muted-foreground">
                      {selectedApu.needQty != null || selectedApu.orderedQty != null
                        ? `Necesidad ${fmtQtyHint(selectedApu.needQty)} · Pedido ${fmtQtyHint(selectedApu.orderedQty)} · Faltante ${fmtQtyHint(selectedApu.shortfallQty ?? selectedApu.quantity)} ${budgetUnitLabel(selectedApu.unit)}`
                        : `Ref. APU: ${fmtQtyHint(selectedApu.quantity)} ${budgetUnitLabel(selectedApu.unit)}`}
                      {selectedApu.unitCost
                        ? ` · ${formatDecimalAr(Number(selectedApu.unitCost))}/u`
                        : ""}
                    </p>
                  ) : null}
                </div>
              </div>

              {productOptions.length > 0 && (
                <div className="space-y-1">
                  <Label className="text-xs">Producto</Label>
                  <SearchableCombobox
                    popoverWidth="wide"
                    className="h-8 text-xs"
                    options={productComboboxOptions}
                    value={line.productId ?? SEARCHABLE_NONE}
                    onValueChange={(v) => {
                      const selected = productOptions.find((pr) => pr.id === v);
                      const next = {
                        ...lines[i],
                        productId: v === SEARCHABLE_NONE ? null : v,
                      };
                      if (selected && !lines[i].unit) next.unit = selected.unit;
                      onChange(lines.map((l, idx) => (idx === i ? next : l)));
                    }}
                    placeholder="Sin producto"
                    searchPlaceholder="Buscar producto…"
                  />
                </div>
              )}

              {/* Descripción en fila completa para leer/editar sin apretar montos. */}
              <div className="space-y-1">
                <Label className="text-xs">Descripción</Label>
                <Input
                  required
                  value={line.description}
                  onChange={(e) => update(i, "description", e.target.value)}
                  placeholder="Descripción del ítem"
                  className="h-9 text-sm"
                />
              </div>

              {/* Montos: una fila con columnas legibles. */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <div className="space-y-1 min-w-0">
                  <Label className="text-xs">Unidad</Label>
                  <UnitSelect
                    value={line.unit}
                    onChange={(v) => update(i, "unit", v)}
                    placeholder="un"
                    className="h-9 text-sm w-full"
                  />
                </div>
                <div className="space-y-1 min-w-0">
                  <Label className="text-xs">Cantidad</Label>
                  <Input
                    required
                    value={line.quantity}
                    onChange={(e) => update(i, "quantity", e.target.value)}
                    placeholder="1"
                    inputMode="decimal"
                    className="h-9 text-sm tabular-nums"
                  />
                </div>
                <div className="space-y-1 min-w-0">
                  <Label className="text-xs">Precio unit.</Label>
                  <Input
                    required
                    value={line.unitPrice}
                    onChange={(e) => update(i, "unitPrice", e.target.value)}
                    placeholder="0.00"
                    inputMode="decimal"
                    className="h-9 text-sm tabular-nums"
                  />
                </div>
                <div className="space-y-1 min-w-0">
                  <Label className="text-xs">Ref. presup.</Label>
                  <div className="flex h-9 items-center text-sm tabular-nums text-muted-foreground">
                    {wbs?.budgetUnitCost != null ? (
                      <button
                        type="button"
                        onClick={() => fillBudgetUnitPrice(i, wbs)}
                        title="Usar este costo como precio unitario"
                        className="text-left underline decoration-dotted underline-offset-2 hover:text-foreground truncate max-w-full"
                      >
                        {formatDecimalAr(Number(wbs.budgetUnitCost))}
                        {wbs.budgetUnit ? ` / ${budgetUnitLabel(wbs.budgetUnit) || wbs.budgetUnit}` : ""}
                      </button>
                    ) : (
                      "—"
                    )}
                  </div>
                </div>
                <div className="space-y-1 min-w-0">
                  <Label className="text-xs">IVA %</Label>
                  <Input
                    value={line.taxRate}
                    onChange={(e) => update(i, "taxRate", e.target.value)}
                    placeholder="21"
                    inputMode="decimal"
                    className="h-9 text-sm tabular-nums"
                  />
                </div>
                <div className="space-y-1 min-w-0">
                  <Label className="text-xs">Total</Label>
                  <p className="flex h-9 items-center text-sm tabular-nums font-semibold">
                    {formatDecimalAr(p.total)}
                  </p>
                </div>
              </div>

              {/* Row 3: variance justification */}
              {showVarianceJustification && (
                <div className="space-y-1">
                  <Label className="text-xs">Justificación desvío</Label>
                  <Input
                    value={line.varianceJustification ?? ""}
                    onChange={(e) => update(i, "varianceJustification", e.target.value)}
                    placeholder="Si supera presupuesto…"
                    className="h-8 text-sm"
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex justify-end gap-8 text-sm border-t pt-3">
        <div className="text-right">
          <p className="text-xs text-muted-foreground font-semibold">Total (vista previa)</p>
          <p className="tabular-nums font-semibold">{formatDecimalAr(totals.total)}</p>
        </div>
      </div>
    </div>
  );
}
