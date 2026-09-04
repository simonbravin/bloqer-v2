"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { addDecimal, divideDecimal, roundMoney, roundQty, QTY_DECIMALS, resolveDocumentLineAmounts, effectiveUnitPriceNet, normalizeDiscountPct } from "@bloqer/utils";
import { isGlobalUnit, IVA_RATE_PRESETS, IVA_RATE_LABEL_ES, normalizeIvaRatePreset } from "@bloqer/domain";
import {
  DEFAULT_VARIANCE_SETTINGS,
  evaluateLineVarianceLenient,
  varianceJustificationReasonEs,
  type VarianceSettings,
} from "@bloqer/services/purchase-variance-pure";
import {
  formatDecimalArFromString,
  formatQtyDisplay,
  formatRatePctWithSymbol,
  formatUnitPriceFromString,
  isPositiveMoneyAmount,
  isPositiveQty,
  variancePctTone,
} from "@/lib/format-money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DecimalInput } from "@/components/ui/decimal-input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SearchableCombobox } from "@/components/ui/searchable-combobox";
import { SEARCHABLE_NONE, productsToSearchableOptions, toSearchableOptions, withNoneOption, wbsToSearchableOptions } from "@/lib/searchable-options";
import { UnitSelect } from "@/features/budgets/components/unit-select";
import { budgetUnitLabel } from "@/lib/budget-units";
import { COST_CATEGORY_OPTIONS, type CostCategoryOptionValue } from "@/lib/cost-category-colors";

export type PurchaseOrderLine = {
  wbsNodeId: string | null;
  productId: string | null;
  costAnalysisLineId: string | null;
  /** Job-cost nature ([D-099]). */
  costType: CostCategoryOptionValue;
  /** SC line link for award-sourced OCs ([BR-PUR-024]). */
  purchaseRequestLineId?: string | null;
  description: string;
  unit: string;
  quantity: string;
  unitPrice: string;
  taxRate: string;
  discountPct: string;
  /** Persist original sortOrder from SC/quote when editing award OCs. */
  sortOrder?: number;
  varianceJustification?: string | null;
};

export type WbsApuOption = {
  id: string;
  description: string;
  unit: string;
  unitCost: string;
  productId: string | null;
  category?: string;
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
  /** APU-derived dominant CostCategory used to pre-select `costType` ([D-099]). */
  dominantCostType?: CostCategoryOptionValue | null;
};
export type ProductOption = { id: string; sku: string; name: string; unit: string };

function linePreview(l: PurchaseOrderLine) {
  try {
    const r = resolveDocumentLineAmounts({
      quantity: l.quantity.trim() || "0",
      unitPrice: l.unitPrice.trim() || "0",
      taxRatePercent: l.taxRate.trim() || "0",
      discountPct: l.discountPct?.trim() || "0",
    });
    return { subtotal: r.lineSubtotal, tax: r.lineTax, total: r.lineTotal };
  } catch {
    return { subtotal: "0.00", tax: "0.00", total: "0.00" };
  }
}

interface Props {
  lines: PurchaseOrderLine[];
  onChange: (lines: PurchaseOrderLine[]) => void;
  wbsOptions: WbsOption[];
  productOptions?: ProductOption[];
  showVarianceJustification?: boolean;
  varianceSettings?: VarianceSettings;
  /** Award-sourced OC: no add/remove lines ([BR-PUR-024]). */
  structureLocked?: boolean;
}

export const DEFAULT_PURCHASE_ORDER_LINE: PurchaseOrderLine = {
  wbsNodeId: null,
  productId: null,
  costAnalysisLineId: null,
  costType: "MATERIAL",
  description: "",
  unit: "",
  quantity: "1",
  unitPrice: "",
  taxRate: "21",
  discountPct: "0",
};

const LINE_FIELD_CLASS = "min-h-11 text-sm md:min-h-9 md:h-9";

function createLineKey(): string {
  return crypto.randomUUID();
}

export function PurchaseOrderLinesEditor({
  lines,
  onChange,
  wbsOptions,
  productOptions = [],
  showVarianceJustification = false,
  varianceSettings = DEFAULT_VARIANCE_SETTINGS,
  structureLocked = false,
}: Props) {
  const wbsComboboxOptions = useMemo(
    () => wbsToSearchableOptions(wbsOptions),
    [wbsOptions],
  );
  const productComboboxOptions = useMemo(
    () => withNoneOption(productsToSearchableOptions(productOptions), { label: "Sin producto" }),
    [productOptions],
  );
  const [headerDiscount, setHeaderDiscount] = useState("");
  const [lineKeys, setLineKeys] = useState<string[]>(() =>
    Array.from({ length: Math.max(lines.length, 1) }, createLineKey),
  );
  // Lines whose `costType` the user set manually. We must not overwrite that
  // when the WBS changes (auto-typing from the APU dominant only kicks in for
  // untouched lines). Persisted lines already carry the user's choice, so the
  // set only tracks changes within this editing session.
  const [manualCostTypeKeys, setManualCostTypeKeys] = useState<Set<string>>(() => new Set());

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

  function update(i: number, field: keyof PurchaseOrderLine, value: string | null) {
    const lineKey = lineKeys[i] ?? String(i);
    const next = lines.map((l, idx) => {
      if (idx !== i) return l;
      const patched: PurchaseOrderLine = { ...l, [field]: value };
      if (field === "wbsNodeId") {
        // Stale APU insumo hint no longer applies to the new partida.
        patched.costAnalysisLineId = null;
        const overriddenManually = manualCostTypeKeys.has(lineKey);
        if (!overriddenManually) {
          // Auto-type from the APU dominant category ([D-099]).
          // - baño químico with 100% EQP → EQP.
          // - excavación with EQP 70% → EQP.
          // - genuinely mixed or empty APU → MATERIAL (safe default; hint asks user to pick).
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
    // Remember that this line's cost type was set by the user; changing the
    // partida later should not stomp on it.
    setManualCostTypeKeys((prev) => {
      if (prev.has(lineKey)) return prev;
      const next = new Set(prev);
      next.add(lineKey);
      return next;
    });
    onChange(lines.map((l, idx) => (idx === i ? { ...l, costType: value } : l)));
  }

  function applyApuHint(i: number, line: PurchaseOrderLine, apuId: string | null, wbs?: WbsOption) {
    if (!apuId) {
      const lineKey = lineKeys[i] ?? String(i);
      const dominant = wbs?.dominantCostType ?? null;
      const restoredType =
        !manualCostTypeKeys.has(lineKey) &&
        dominant &&
        COST_CATEGORY_OPTIONS.some((o) => o.value === dominant)
          ? dominant
          : line.costType;
      onChange(
        lines.map((l, idx) =>
          idx === i ? { ...l, costAnalysisLineId: null, costType: restoredType } : l,
        ),
      );
      return;
    }
    const apu = wbs?.apuLines?.find((a) => a.id === apuId);
    if (!apu) {
      update(i, "costAnalysisLineId", apuId);
      return;
    }
    const prefillQty = isPositiveQty(apu.quantity) && apu.quantity
      ? apu.quantity
      : line.quantity;
    const next: PurchaseOrderLine = {
      ...line,
      costAnalysisLineId: apu.id,
      costType: (COST_CATEGORY_OPTIONS.some((o) => o.value === apu.category)
        ? (apu.category as PurchaseOrderLine["costType"])
        : "MATERIAL"),
      description: apu.description,
      unit: apu.unit,
      productId: apu.productId ?? line.productId,
      unitPrice: line.unitPrice.trim() ? line.unitPrice : apu.unitCost,
      quantity: prefillQty,
    };
    onChange(lines.map((l, idx) => (idx === i ? next : l)));
    const hint =
      apu.needQty != null || apu.orderedQty != null
        ? `Necesidad ${formatQtyDisplay(apu.needQty)} · Pedido ${formatQtyDisplay(apu.orderedQty)} · Faltante ${formatQtyDisplay(apu.shortfallQty ?? apu.quantity)}`
        : `faltante ${formatQtyDisplay(apu.quantity)}`;
    toast.success(`Insumo APU aplicado (${hint}). Podés ajustar cantidad y unidad.`);
  }

  /** Trae el costo unitario del presupuesto (APU) al campo Precio unit. */
  function fillBudgetUnitPrice(i: number, wbs?: WbsOption) {
    if (!wbs?.budgetUnitCost || !isPositiveMoneyAmount(wbs.budgetUnitCost)) return;
    update(i, "unitPrice", wbs.budgetUnitCost);
    toast.success("Precio unitario completado con el referencial del presupuesto.");
  }

  /** Ajusta la cantidad para consumir el saldo disponible de la partida. */
  function consumePartidaSaldo(i: number, line: PurchaseOrderLine, wbs?: WbsOption) {
    if (wbs?.availableSaldo == null) return;
    if (!isPositiveMoneyAmount(wbs.availableSaldo)) {
      toast.error("La partida no tiene saldo disponible para consumir.");
      return;
    }
    const price = line.unitPrice.trim() || wbs.budgetUnitCost || "";
    if (!price || !isPositiveMoneyAmount(price)) {
      toast.error("Definí primero un precio unitario (o usá el referencial).");
      return;
    }
    let effective: string;
    try {
      effective = effectiveUnitPriceNet({
        quantity: "1",
        unitPriceNet: price,
        discountPct: line.discountPct?.trim() || "0",
      });
    } catch {
      toast.error("No se pudo calcular el precio con descuento.");
      return;
    }
    if (!isPositiveMoneyAmount(effective)) {
      toast.error("El precio efectivo queda en cero con ese descuento.");
      return;
    }
    let qty: string;
    try {
      qty = roundQty(divideDecimal(wbs.availableSaldo, effective, QTY_DECIMALS));
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
    if (structureLocked) return;
    setLineKeys((keys) => [...keys, createLineKey()]);
    onChange([...lines, { ...DEFAULT_PURCHASE_ORDER_LINE }]);
  }

  function removeLine(i: number) {
    if (structureLocked || lines.length <= 1) return;
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">Líneas</p>
        {!structureLocked ? (
          <Button type="button" variant="outline" size="sm" className="min-h-11 md:min-h-8" onClick={addLine}>
            + Agregar línea
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground">Ítems fijados por la adjudicación</p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Label htmlFor="po-header-discount" className="text-xs text-muted-foreground whitespace-nowrap">
          Descuento general %
        </Label>
        <DecimalInput
          id="po-header-discount"
          value={headerDiscount}
          onValueChange={setHeaderDiscount}
          placeholder="0"
          className="h-11 w-20 text-sm md:h-8"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-11 md:min-h-8"
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
      </div>
      <p className="text-xs text-muted-foreground">
        Cada línea debe imputar a un ítem EDT. Para gastos generales usá la partida de
        indirectos del presupuesto.
      </p>

      <div className="space-y-3">
        {lines.map((line, i) => {
          const lineKey = lineKeys[i] ?? String(i);
          const p = linePreview(line);
          const wbs = wbsOptions.find((w) => w.id === line.wbsNodeId);
          const selectedApu = wbs?.apuLines?.find((a) => a.id === line.costAnalysisLineId);
          const budgetUnit = selectedApu?.unit ?? wbs?.budgetUnit ?? null;
          const sameUnitApus = (wbs?.apuLines ?? []).filter(
            (a) => a.unit.trim().toLowerCase() === line.unit.trim().toLowerCase(),
          );
          const partidaRefIsGlobal =
            !selectedApu && isGlobalUnit(wbs?.budgetUnit) && !isGlobalUnit(line.unit);
          const budgetUnitCost = selectedApu?.unitCost
            ? selectedApu.unitCost
            : partidaRefIsGlobal
              ? null
              : (wbs?.budgetUnitCost ?? null);
          const liveVariance = evaluateLineVarianceLenient(
            {
              unit: line.unit,
              unitPrice: line.unitPrice.trim() || "0",
              discountPct: line.discountPct?.trim() || "0",
              budgetUnitCost,
              budgetUnit,
            },
            varianceSettings,
          );
          const justificationRequired = Boolean(
            liveVariance.requiresJustification && !line.varianceJustification?.trim(),
          );
          const varianceTone = liveVariance.variancePct
            ? variancePctTone(liveVariance.variancePct)
            : "muted";
          return (
            <section
              key={lineKey}
              aria-label={`Línea ${i + 1}`}
              className="form-section p-3 space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-medium text-muted-foreground">Línea {i + 1}</p>
                {lines.length > 1 && !structureLocked && (
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

              {/* Row 1: EDT + Insumo APU */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-1">
                  <Label className="text-xs">EDT (obligatorio)</Label>
                  <SearchableCombobox
                    popoverWidth="wide"
                    className={LINE_FIELD_CLASS}
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
                      Saldo part.: {formatDecimalArFromString(wbs.availableSaldo)}
                      {wbs.wouldExceedBudget ? " (alerta)" : ""}
                    </button>
                  )}
                  {wbs?.wouldExceedBudget ? (
                    <p className="text-[10px] text-destructive">
                      Esta partida ya está cerca o por encima del saldo disponible (aviso; no bloquea).
                    </p>
                  ) : null}
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`po-line-${lineKey}-cost-type`} className="text-xs">
                    Tipo de costo
                  </Label>
                  <Select
                    value={line.costType ?? "MATERIAL"}
                    onValueChange={(v) => updateCostType(i, v as CostCategoryOptionValue)}
                  >
                    <SelectTrigger id={`po-line-${lineKey}-cost-type`} className={LINE_FIELD_CLASS}>
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
                    {wbs && wbs.dominantCostType == null && line.wbsNodeId
                      ? "Esta partida tiene varios tipos en su APU; elegí el correcto."
                      : "Sugerido desde APU."}
                  </p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Insumo APU</Label>
                  <SearchableCombobox
                    popoverWidth="wide"
                    className={LINE_FIELD_CLASS}
                    options={withNoneOption(
                      toSearchableOptions(
                        (wbs?.apuLines ?? []).map((a) => ({
                          id: a.id,
                          label:
                            a.shortfallQty != null || a.quantity != null
                              ? `${a.description} (faltante ${formatQtyDisplay(a.shortfallQty ?? a.quantity)} ${budgetUnitLabel(a.unit)})`
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
                        ? `Necesidad ${formatQtyDisplay(selectedApu.needQty)} · Pedido ${formatQtyDisplay(selectedApu.orderedQty)} · Faltante ${formatQtyDisplay(selectedApu.shortfallQty ?? selectedApu.quantity)} ${budgetUnitLabel(selectedApu.unit)}`
                        : `Ref. APU: ${formatQtyDisplay(selectedApu.quantity)} ${budgetUnitLabel(selectedApu.unit)}`}
                      {selectedApu.unitCost
                        ? ` · ${formatDecimalArFromString(selectedApu.unitCost)}/u`
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
                    className={LINE_FIELD_CLASS}
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
                  className={LINE_FIELD_CLASS}
                />
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="space-y-1 min-w-0">
                  <Label className="text-xs">Unidad</Label>
                  <UnitSelect
                    value={line.unit}
                    onChange={(v) => update(i, "unit", v)}
                    placeholder="un"
                    className={`${LINE_FIELD_CLASS} w-full`}
                  />
                </div>
                <div className="space-y-1 min-w-0">
                  <Label className="text-xs">Cantidad</Label>
                  <DecimalInput
                    required
                    value={line.quantity}
                    onValueChange={(v) => update(i, "quantity", v)}
                    placeholder="1,00"
                    className={LINE_FIELD_CLASS}
                  />
                </div>
                <div className="space-y-1 min-w-0">
                  <Label className="text-xs">Precio unitario</Label>
                  <DecimalInput
                    required
                    value={line.unitPrice}
                    onValueChange={(v) => update(i, "unitPrice", v)}
                    placeholder="0,00"
                    className={LINE_FIELD_CLASS}
                  />
                </div>
                <div className="space-y-1 min-w-0">
                  <Label className="text-xs">Ref. presupuesto</Label>
                  <div className="flex min-h-11 items-center text-sm tabular-nums text-muted-foreground md:min-h-9">
                    {budgetUnitCost != null ? (
                      <button
                        type="button"
                        onClick={() => {
                          if (selectedApu?.unitCost) {
                            update(i, "unitPrice", selectedApu.unitCost);
                            toast.success("Precio unitario completado con el referencial del insumo APU.");
                            return;
                          }
                          fillBudgetUnitPrice(i, wbs);
                        }}
                        title="Usar este costo como precio unitario"
                        className="max-w-full truncate text-left underline decoration-dotted underline-offset-2 hover:text-foreground"
                      >
                        {formatDecimalArFromString(budgetUnitCost)}
                        {budgetUnit ? ` / ${budgetUnitLabel(budgetUnit) || budgetUnit}` : ""}
                      </button>
                    ) : (
                      "—"
                    )}
                  </div>
                  {partidaRefIsGlobal ? (
                    <p className="text-[10px] text-muted-foreground leading-snug">
                      Partida en global: el total no es un $/u.
                      {sameUnitApus.length > 0
                        ? ` Insumo APU en ${budgetUnitLabel(line.unit) || line.unit}: ${sameUnitApus
                            .map((a) => `${a.description} (${formatDecimalArFromString(a.unitCost)})`)
                            .join("; ")}.`
                        : " Elegí un insumo APU para tomar su referencial."}
                    </p>
                  ) : null}
                </div>
              </div>

              <p className="text-[11px] text-muted-foreground">
                PU {line.unitPrice.trim() ? formatUnitPriceFromString(line.unitPrice) : "—"}
                {" · "}
                Ref {budgetUnitCost ? formatUnitPriceFromString(budgetUnitCost) : "—"}
                {" · "}
                Desvío{" "}
                {liveVariance.variancePct ? (
                  <span
                    className={
                      varianceTone === "success"
                        ? "text-emerald-600 dark:text-emerald-400"
                        : varianceTone === "danger"
                          ? "text-destructive"
                          : undefined
                    }
                  >
                    {formatRatePctWithSymbol(liveVariance.variancePct)}
                  </span>
                ) : partidaRefIsGlobal ? (
                  "no aplica (partida global)"
                ) : liveVariance.varianceTier === "UNIT_MISMATCH" ? (
                  "unidad distinta"
                ) : liveVariance.varianceTier === "NO_BUDGET_BASELINE" ? (
                  "sin referencial"
                ) : (
                  "—"
                )}
              </p>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1 min-w-0">
                  <Label className="text-xs">Desc. %</Label>
                  <DecimalInput
                    value={line.discountPct ?? "0"}
                    onValueChange={(v) => update(i, "discountPct", v)}
                    placeholder="0"
                    className={LINE_FIELD_CLASS}
                  />
                </div>
                <div className="space-y-1 min-w-0">
                  <Label className="text-xs">IVA %</Label>
                  <Select
                    value={normalizeIvaRatePreset(line.taxRate) ?? undefined}
                    onValueChange={(v) => update(i, "taxRate", v)}
                  >
                    <SelectTrigger className={LINE_FIELD_CLASS}>
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
                  <Label className="text-xs">Total</Label>
                  <p className="flex min-h-11 items-center text-sm tabular-nums font-semibold md:min-h-9">
                    {formatDecimalArFromString(p.total)}
                  </p>
                </div>
              </div>

              {/* Row 3: variance justification */}
              {showVarianceJustification && (
                <div className="space-y-1">
                  <Label className="text-xs">
                    Justificación desvío
                    {justificationRequired ? " (obligatoria)" : ""}
                  </Label>
                  <Input
                    value={line.varianceJustification ?? ""}
                    onChange={(e) => update(i, "varianceJustification", e.target.value)}
                    placeholder={
                      justificationRequired
                        ? "Completá por qué se desvía esta línea…"
                        : "Si el precio supera el referencial…"
                    }
                    aria-invalid={justificationRequired || undefined}
                    className={
                      justificationRequired
                        ? `${LINE_FIELD_CLASS} border-destructive`
                        : LINE_FIELD_CLASS
                    }
                  />
                  {justificationRequired && liveVariance ? (
                    <p className="text-[10px] text-destructive leading-snug">
                      Esta línea pide nota ({varianceJustificationReasonEs(liveVariance.varianceTier)})
                      antes de enviar a aprobación.
                    </p>
                  ) : liveVariance?.varianceTier === "NONE" && partidaRefIsGlobal ? (
                    <p className="text-[10px] text-muted-foreground leading-snug">
                      Sin referencial unitario no hay desvío que justificar. El saldo de la partida sigue
                      siendo un aviso al enviar.
                    </p>
                  ) : null}
                </div>
              )}
            </section>
          );
        })}
      </div>

      <div className="flex justify-end gap-8 text-sm border-t pt-3">
        <div className="text-right">
          <p className="text-xs text-muted-foreground font-semibold">Total (vista previa)</p>
          <p className="tabular-nums font-semibold">{formatDecimalArFromString(totals.total)}</p>
        </div>
      </div>
    </div>
  );
}
