"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatMoneyAmount, formatQtyFromString } from "@/lib/format-money";
import { DecimalInput } from "@/components/ui/decimal-input";
import { CATEGORY_LABELS, VISIBLE_COST_CATEGORIES, type VisibleCostCategory } from "@/lib/budget-categories";
import { budgetUnitLabel } from "@/lib/budget-units";
import { UnitSelect } from "./unit-select";
import { CostAnalysisLineForm } from "./cost-analysis-line-form";
import { ApuEntryModeToggle } from "./apu-entry-mode-toggle";
import type { WbsViewNode, CostAnalysisLineView, CostItemView } from "@bloqer/services";
import type { SaveCostItemApuInput, UpdateCostAnalysisLineInput } from "@bloqer/validators";
import type { CostCategory } from "@bloqer/database";
import {
  APU_GLOBAL_UNIT,
  canUseTotalPartidaMode,
  convertApuEntryMode,
  isGlobalUnit,
  migrateLegacyLumpToGlobalResource,
  normalizeStoredApuLineForItemQuantity,
  previewApuEntry,
  recomputeLumpForItemQuantity,
  recomputeResourceForItemQuantity,
  toEntryApuLine,
  toStoredApuLine,
  type ApuEntryMode,
} from "@bloqer/domain";
import { apuResourceQtyDisplay } from "../lib/wbs-apu-detail";

type LocalLine = CostAnalysisLineView & {
  _isNew?: boolean;
  _deleted?: boolean;
};

function buildApuSnapshot(
  unit: string,
  quantity: string,
  notes: string,
  lines: LocalLine[],
): string {
  return JSON.stringify({
    unit,
    quantity,
    notes,
    lines: lines
      .filter((l) => !l._deleted)
      .map(({ _isNew, _deleted, ...rest }) => rest),
  });
}

function parseQuantityInput(quantity: string): number | undefined {
  const trimmed = quantity.trim();
  if (trimmed === "") return undefined;
  const n = parseFloat(trimmed);
  return Number.isNaN(n) ? undefined : n;
}

function fmtNum(value: string) {
  return formatQtyFromString(value);
}

function fmtMoney(value: string, currency: string) {
  return formatMoneyAmount(value, currency);
}

function displayResourceQtyLabel(line: LocalLine, itemQty: number): string {
  const d = apuResourceQtyDisplay(line, itemQty);
  // Legacy lump: no physical need — show em dash (not the word "global").
  if (d.kind === "lump") return "—";
  return formatQtyFromString(String(d.qty));
}

/** Partida money for dialog table — resource uses cant×precio (stable while typing qty). */
function displayPartidaLineTotal(line: LocalLine, itemQty: number): number {
  const unitContribution = parseFloat(line.totalCost) || 0;
  if (line.isLumpSum) return unitContribution * itemQty;
  if (line.partidaQuantity != null && line.partidaQuantity !== "") {
    const pq = parseFloat(line.partidaQuantity) || 0;
    const price = parseFloat(line.unitCost) || 0;
    return pq * price;
  }
  return unitContribution * itemQty;
}

/**
 * Precio de recurso en tabla. Legacy lump guarda aporte /u en unitCost — mostrar el monto
 * de partida (1 Global × monto) para no confundir con precio unitario del ítem.
 */
function displayResourceUnitPrice(line: LocalLine, itemQty: number): number {
  if (line.isLumpSum) {
    const unitContribution = parseFloat(line.totalCost) || 0;
    return itemQty > 0 ? unitContribution * itemQty : unitContribution;
  }
  return parseFloat(line.unitCost) || 0;
}

/** [D-047] Convert legacy isLumpSum → resource + gl before persist (money-preserving). */
function migrateLegacyLumpLine(line: LocalLine, itemQty: number): LocalLine {
  if (!line.isLumpSum || !(itemQty > 0)) return line;
  const stored = migrateLegacyLumpToGlobalResource(
    {
      coefficient: parseFloat(line.coefficient) || 0,
      unitCost: parseFloat(line.unitCost) || 0,
      totalCost: parseFloat(line.totalCost) || 0,
      partidaQuantity:
        line.partidaQuantity == null || line.partidaQuantity === ""
          ? null
          : parseFloat(line.partidaQuantity),
      isLumpSum: true,
    },
    itemQty,
  );
  return {
    ...line,
    unit: APU_GLOBAL_UNIT,
    coefficient: String(stored.coefficient),
    unitCost: String(stored.unitCost),
    totalCost: String(stored.totalCost),
    partidaQuantity: stored.partidaQuantity != null ? String(stored.partidaQuantity) : null,
    isLumpSum: false,
  };
}

function recomputeLocalLinesForItemQty(
  lines: LocalLine[],
  oldQty: number,
  newQty: number,
): LocalLine[] {
  if (!(oldQty > 0) || !(newQty > 0) || oldQty === newQty) return lines;
  return lines.map((line) => {
    if (line._deleted) return line;
    const coefficient = parseFloat(line.coefficient) || 0;
    const unitCost = parseFloat(line.unitCost) || 0;
    const totalCost = parseFloat(line.totalCost) || 0;
    const partidaQuantity =
      line.partidaQuantity == null || line.partidaQuantity === ""
        ? null
        : parseFloat(line.partidaQuantity);
    const isLumpSum = Boolean(line.isLumpSum);

    if (isLumpSum) {
      const next = recomputeLumpForItemQuantity(totalCost * oldQty, newQty);
      return {
        ...line,
        coefficient: String(next.coefficient),
        unitCost: String(next.unitCost),
        totalCost: String(next.totalCost),
        partidaQuantity: String(next.partidaQuantity),
        isLumpSum: true,
      };
    }
    if (partidaQuantity != null) {
      const next = recomputeResourceForItemQuantity(
        { coefficient, unitCost, totalCost, partidaQuantity, isLumpSum: false },
        newQty,
      );
      return {
        ...line,
        coefficient: String(next.coefficient),
        unitCost: String(next.unitCost),
        totalCost: String(next.totalCost),
        partidaQuantity: String(next.partidaQuantity),
        isLumpSum: false,
      };
    }
    const next = normalizeStoredApuLineForItemQuantity(
      { coefficient, unitCost, totalCost, partidaQuantity: null, isLumpSum: false },
      newQty,
    );
    return {
      ...line,
      coefficient: String(next.coefficient),
      unitCost: String(next.unitCost),
      totalCost: String(next.totalCost),
      partidaQuantity: null,
      isLumpSum: false,
    };
  });
}

interface CostItemApuDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  node: WbsViewNode | null;
  currency: string;
  editable: boolean;
  onSaveApu: (data: SaveCostItemApuInput) => Promise<{ ok: true } | { error: string }>;
  /** @deprecated kept for CostAnalysisLineForm edit path compatibility — prefer onSaveApu */
  onUpdateCostItem?: never;
  onAddLine?: never;
  onUpdateLine?: never;
  onRemoveLine?: never;
}

export function CostItemApuDialog({
  open,
  onOpenChange,
  node,
  currency,
  editable,
  onSaveApu,
}: CostItemApuDialogProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState<VisibleCostCategory>("MATERIAL");
  const [editLine, setEditLine] = useState<LocalLine | null>(null);

  const canShowApu = node !== null && node.children.length === 0;
  const costItem = canShowApu ? node.costItem : null;

  const [unit, setUnit] = useState("");
  const [quantity, setQuantity] = useState("");
  const quantityRef = useRef(quantity);
  quantityRef.current = quantity;
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LocalLine[]>([]);
  const [initialSnapshot, setInitialSnapshot] = useState<string>("");

  const [newDesc, setNewDesc] = useState("");
  const [newUnit, setNewUnit] = useState("un");
  const [newCoef, setNewCoef] = useState("1");
  const [newUnitCost, setNewUnitCost] = useState("0");
  const [entryMode, setEntryMode] = useState<ApuEntryMode>("total");
  /** Last item qty used to derive local line unit contributions. */
  const [linesQtyBasis, setLinesQtyBasis] = useState(0);

  const resetFromCostItem = useCallback((ci: CostItemView) => {
    setUnit(ci.unit);
    setQuantity(ci.quantity);
    setNotes(ci.notes ?? "");
    const initialLines = ci.analysisLines.map((l) => ({
      ...l,
      partidaQuantity: l.partidaQuantity ?? null,
      isLumpSum: l.isLumpSum ?? false,
    }));
    setLines(initialLines);
    setLinesQtyBasis(parseFloat(ci.quantity) || 0);
    setInitialSnapshot(
      buildApuSnapshot(ci.unit, ci.quantity, ci.notes ?? "", initialLines),
    );
    setNewDesc("");
    setNewUnit("un");
    setNewCoef("1");
    setNewUnitCost("0");
    setEntryMode("total");
    setEditLine(null);
    setActiveTab("MATERIAL");
  }, []);

  // Reset only when opening or switching ítem — not on every parent refresh (preserves dirty edits).
  const loadedKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!open || !costItem) {
      if (!open) loadedKeyRef.current = null;
      return;
    }
    const key = costItem.id;
    if (loadedKeyRef.current === key) return;
    loadedKeyRef.current = key;
    resetFromCostItem(costItem);
  }, [open, costItem, resetFromCostItem]);

  /** Apply qty change to local APU lines (blur / save) — not on every keystroke. */
  function syncLinesToQuantity(nextQtyRaw: number): LocalLine[] {
    if (!(nextQtyRaw > 0) || !(linesQtyBasis > 0) || nextQtyRaw === linesQtyBasis) {
      return lines;
    }
    const next = recomputeLocalLinesForItemQty(lines, linesQtyBasis, nextQtyRaw);
    setLines(next);
    setLinesQtyBasis(nextQtyRaw);
    return next;
  }

  const isDirty = useMemo(() => {
    if (!costItem || !initialSnapshot) return false;
    return buildApuSnapshot(unit, quantity, notes, lines) !== initialSnapshot;
  }, [costItem, unit, quantity, notes, lines, initialSnapshot]);

  const unitByCategory = useMemo(() => {
    const amounts = {
      MATERIAL: 0,
      LABOR: 0,
      EQUIPMENT: 0,
      SUBCONTRACT: 0,
    };
    for (const line of lines) {
      if (line._deleted || line.category === "OTHER") continue;
      if (line.category in amounts) {
        amounts[line.category as VisibleCostCategory] += parseFloat(line.totalCost) || 0;
      }
    }
    return amounts;
  }, [lines]);

  const unitCostDirect = useMemo(() => {
    return (
      unitByCategory.MATERIAL +
      unitByCategory.LABOR +
      unitByCategory.EQUIPMENT +
      unitByCategory.SUBCONTRACT
    );
  }, [unitByCategory]);

  const qtyN = parseFloat(quantity) || 0;
  const totalProjectCost = unitCostDirect * qtyN;
  const entryPreview = useMemo(
    () =>
      previewApuEntry({
        mode: entryMode,
        totalKind: "resource",
        coefficient: parseFloat(newCoef) || 0,
        unitCost: parseFloat(newUnitCost) || 0,
        itemQuantity: qtyN,
      }),
    [entryMode, newCoef, newUnitCost, qtyN],
  );

  const visibleLines = lines.filter((l) => !l._deleted && l.category === activeTab);
  const legacyOtherLines = lines.filter((l) => !l._deleted && l.category === "OTHER");

  function requestClose(next: boolean) {
    if (!next && isDirty) {
      if (!confirm("Hay cambios sin guardar. ¿Cerrar igualmente?")) return;
    }
    onOpenChange(next);
  }

  function addInlineLine() {
    if (!costItem || !newDesc.trim()) {
      toast.error("Ingresá una descripción");
      return;
    }
    if (!newUnit.trim()) {
      toast.error("Elegí una unidad");
      return;
    }
    const itemQty = parseFloat(quantity) || 0;
    if (entryMode === "total" && !canUseTotalPartidaMode(itemQty)) {
      toast.error("Definí la cantidad del ítem para cargar por total de partida");
      return;
    }
    // Align existing lines to the qty used for the new row (blur may not have run yet).
    const baseLines = syncLinesToQuantity(itemQty);
    const coefInput = parseFloat(newCoef) || 0;
    const ucInput = parseFloat(newUnitCost) || 0;
    // UI only exposes resource path; Global (`gl`) is non-purchasable via materials board.
    const stored = toStoredApuLine({
      mode: entryMode,
      totalKind: "resource",
      coefficient: coefInput,
      unitCost: ucInput,
      itemQuantity: itemQty,
    });
    const tempId = `temp_${crypto.randomUUID()}`;
    setLines([
      ...baseLines,
      {
        id: tempId,
        category: activeTab,
        description: newDesc.trim(),
        unit: newUnit.trim(),
        coefficient: String(stored.coefficient),
        unitCost: String(stored.unitCost),
        totalCost: String(stored.totalCost),
        partidaQuantity: stored.partidaQuantity != null ? String(stored.partidaQuantity) : null,
        isLumpSum: false,
        productId: null,
        sortOrder: baseLines.filter((l) => !l._deleted).length,
        supplierContactId: null,
        notes: null,
        _isNew: true,
      },
    ]);
    setNewDesc("");
    setNewCoef("1");
    setNewUnitCost("0");
  }

  function handleEntryModeChange(next: ApuEntryMode) {
    const itemQty = parseFloat(quantity) || 0;
    if (next === "total" && !canUseTotalPartidaMode(itemQty)) {
      toast.error("Definí la cantidad del ítem para cargar por total de partida");
      return;
    }
    if (next !== entryMode) {
      const converted = convertApuEntryMode(
        entryMode,
        next,
        {
          coefficient: parseFloat(newCoef) || 0,
          unitCost: parseFloat(newUnitCost) || 0,
        },
        itemQty,
        "resource",
      );
      setNewCoef(String(converted.coefficient));
      setNewUnitCost(String(converted.unitCost));
    }
    setEntryMode(next);
  }

  function markDelete(lineId: string) {
    setLines((prev) =>
      prev.map((l) => (l.id === lineId ? { ...l, _deleted: true } : l)),
    );
  }

  function handleSave() {
    if (!costItem || !initialSnapshot) return;
    const qty = parseQuantityInput(quantity);
    if (qty !== undefined && qty <= 0) {
      toast.error("La cantidad del ítem debe ser mayor a 0");
      return;
    }
    startTransition(async () => {
      const qtyForLines = qty ?? (parseFloat(quantity) || linesQtyBasis);
      const syncedLines = syncLinesToQuantity(qtyForLines);
      // [D-047] Persist-time: legacy Monto global → resource + gl (lazy if never edited).
      const linesForSave = syncedLines.map((l) =>
        l._deleted ? l : migrateLegacyLumpLine(l, qtyForLines),
      );
      if (linesForSave.some((l, i) => l !== syncedLines[i])) {
        setLines(linesForSave);
      }
      const payload: SaveCostItemApuInput = {
        costItemId: costItem.id,
        unit: unit || undefined,
        quantity: qty,
        notes: notes || null,
        lines: linesForSave
          .filter((l) => !(l._isNew && l._deleted))
          .map((l) => ({
            id: l._isNew ? undefined : l.id,
            category: l.category as CostCategory,
            description: l.description,
            unit: l.unit,
            coefficient: parseFloat(l.coefficient) || 0,
            unitCost: parseFloat(l.unitCost) || 0,
            totalCost: parseFloat(l.totalCost) || 0,
            partidaQuantity:
              l.partidaQuantity == null || l.partidaQuantity === ""
                ? null
                : parseFloat(l.partidaQuantity),
            isLumpSum: l.isLumpSum ?? false,
            productId: l.productId ?? null,
            sortOrder: l.sortOrder,
            notes: l.notes,
            _delete: Boolean(l._deleted && !l._isNew),
          })),
      };

      const result = await onSaveApu(payload);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }

      toast.success("Cambios guardados");
      router.refresh();
      onOpenChange(false);
    });
  }

  if (!canShowApu || !costItem || !node) return null;

  const itemUnitLabel = budgetUnitLabel(unit) || "und.";

  return (
    <>
      <Dialog open={open} onOpenChange={requestClose}>
        <DialogContent className="flex max-h-[90vh] max-w-5xl flex-col gap-0 overflow-hidden p-0">
          <div className="border-b px-5 py-3 pr-12">
            <DialogTitle className="text-base">
              APU — Análisis de precio unitario
            </DialogTitle>
            <p className="mt-0.5 text-sm text-muted-foreground">
              <span className="font-mono">{node.code}</span> — {node.name}
            </p>
            {node.description?.trim() ? (
              <p className="mt-1 text-xs leading-snug text-muted-foreground">
                {node.description.trim()}
              </p>
            ) : null}
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto px-5 py-3">
            {/* 1. Datos del ítem */}
            <section className="form-section space-y-2 p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Datos del ítem
                </h3>
                <p className="text-[10px] text-muted-foreground">
                  Venta y márgenes se editan en la EDT
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className="space-y-0.5">
                  <Label className="text-[11px]">Unidad</Label>
                  {editable ? (
                    <UnitSelect value={unit} onChange={setUnit} className="h-8" />
                  ) : (
                    <p className="text-sm font-medium">{unit || "—"}</p>
                  )}
                </div>
                <div className="space-y-0.5">
                  <Label className="text-[11px]">Cantidad</Label>
                  {editable ? (
                    <DecimalInput
                      value={quantity}
                      onValueChange={(v) => {
                        quantityRef.current = v;
                        setQuantity(v);
                      }}
                      onBlur={() => {
                        const next = parseFloat(quantityRef.current) || 0;
                        if (next > 0) syncLinesToQuantity(next);
                      }}
                      className="h-8 font-mono"
                    />
                  ) : (
                    <p className="font-mono text-sm font-medium">{fmtNum(quantity)}</p>
                  )}
                </div>
                <div className="space-y-0.5">
                  <Label className="text-[11px]">Costo dir. /u</Label>
                  <p className="font-mono text-sm font-medium">
                    {fmtMoney(String(unitCostDirect), currency)}
                  </p>
                </div>
                <div className="space-y-0.5">
                  <Label className="text-[11px]">Costo directo</Label>
                  <p className="font-mono text-sm font-semibold">
                    {fmtMoney(String(totalProjectCost), currency)}
                  </p>
                </div>
              </div>
              {editable ? (
                <div className="space-y-0.5">
                  <Label className="text-[11px]">Notas</Label>
                  <Textarea
                    rows={1}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="min-h-7 resize-y text-xs"
                    placeholder="Opcional"
                  />
                </div>
              ) : null}
            </section>

            {/* 2. Costo por categoría */}
            <section className="form-section space-y-1.5 p-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Costo por categoría
              </h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {VISIBLE_COST_CATEGORIES.map((cat) => (
                  <div key={cat} className="rounded-md border bg-card px-2 py-1.5 text-center">
                    <p className="text-[10px] leading-tight text-muted-foreground">
                      {CATEGORY_LABELS[cat]} /u
                    </p>
                    <p className="font-mono text-xs font-semibold tabular-nums">
                      {fmtMoney(String(unitByCategory[cat]), currency)}
                    </p>
                  </div>
                ))}
                <div className="col-span-2 rounded-md border border-primary/25 bg-primary/5 px-2 py-1.5 text-center sm:col-span-1">
                  <p className="text-[10px] leading-tight text-muted-foreground">Costo dir. /u</p>
                  <p className="font-mono text-xs font-bold tabular-nums">
                    {fmtMoney(String(unitCostDirect), currency)}
                  </p>
                  <p className="mt-0.5 text-[10px] leading-tight text-muted-foreground">
                    Total: {fmtMoney(String(totalProjectCost), currency)} · {fmtNum(quantity)}{" "}
                    {itemUnitLabel}
                  </p>
                </div>
              </div>
            </section>

            {/* 3. Insumos APU — alta arriba, listado abajo */}
            <section className="form-section space-y-2 p-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Insumos APU
              </h3>
              <div className="flex flex-wrap gap-1">
                {VISIBLE_COST_CATEGORIES.map((cat) => {
                  const count = lines.filter((l) => !l._deleted && l.category === cat).length;
                  return (
                    <Button
                      key={cat}
                      type="button"
                      size="sm"
                      variant={activeTab === cat ? "default" : "outline"}
                      className="h-7 text-xs"
                      onClick={() => setActiveTab(cat)}
                    >
                      {CATEGORY_LABELS[cat]} ({count})
                    </Button>
                  );
                })}
              </div>

              {editable && (
                <div className="space-y-2 rounded-md border border-dashed bg-muted/20 p-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold">
                      Agregar {CATEGORY_LABELS[activeTab]}
                    </p>
                    <ApuEntryModeToggle
                      value={entryMode}
                      onChange={handleEntryModeChange}
                      totalDisabled={!canUseTotalPartidaMode(parseFloat(quantity) || 0)}
                      unitTooltip={`Consumo y precio por cada 1 ${itemUnitLabel}. Total partida = aporte × ${fmtNum(quantity)} ${itemUnitLabel}.`}
                      totalTooltip={`Cantidad total del recurso para esta partida. No se multiplica otra vez por ${fmtNum(quantity)} ${itemUnitLabel}. Importes sin compra: unidad Global.`}
                    />
                  </div>
                  <p className="text-[10px] leading-snug text-muted-foreground">
                    {entryMode === "total"
                      ? `Cant. recurso de toda la partida (ej. 500 kg). Unidad Global + cant. 1 = importe sin necesidad en Materiales.`
                      : `Por cada 1 ${itemUnitLabel}. Cantidad del ítem: ${fmtNum(quantity)} ${itemUnitLabel}.`}
                  </p>
                  <div className="grid gap-2 sm:grid-cols-[1fr_6rem_5rem_6rem_auto] sm:items-end">
                    <div className="space-y-0.5">
                      <Label className="text-[11px]">Descripción</Label>
                      <Input
                        value={newDesc}
                        onChange={(e) => setNewDesc(e.target.value)}
                        placeholder="Nombre"
                        className="h-8"
                      />
                    </div>
                    <div className="space-y-0.5">
                      <Label className="text-[11px]" title="Global = importe sin cantidad comprable">
                        Unidad
                      </Label>
                      <UnitSelect value={newUnit} onChange={setNewUnit} className="h-8" />
                    </div>
                    <div className="space-y-0.5">
                      <Label className="text-[11px]">
                        {entryMode === "total" ? "Cant. recurso" : "Rendim."}
                      </Label>
                      <DecimalInput
                        value={newCoef}
                        onValueChange={setNewCoef}
                        className="h-8 font-mono"
                      />
                    </div>
                    <div className="space-y-0.5">
                      <Label className="text-[11px]">Precio</Label>
                      <DecimalInput
                        value={newUnitCost}
                        onValueChange={setNewUnitCost}
                        className="h-8 font-mono"
                      />
                    </div>
                    <Button type="button" size="sm" className="h-8" onClick={addInlineLine}>
                      <Plus className="mr-1 h-3 w-3" /> Agregar
                    </Button>
                  </div>
                  <p className="space-x-2.5 font-mono text-[10px] text-muted-foreground">
                    <span>
                      Necesidad:{" "}
                      {isGlobalUnit(newUnit)
                        ? "— (Global, sin compra)"
                        : fmtNum(String(entryPreview.resourceNeed))}
                    </span>
                    {!isGlobalUnit(newUnit) && entryPreview.yieldPerItemUnit != null && (
                      <span>
                        Rendim. / {itemUnitLabel}: {fmtNum(String(entryPreview.yieldPerItemUnit))}
                      </span>
                    )}
                    <span>Aporte /u: {fmtNum(String(entryPreview.unitTotal))}</span>
                    <span className="font-medium text-foreground/80">
                      Total partida: {fmtNum(String(entryPreview.partidaTotal))}
                    </span>
                  </p>
                </div>
              )}

              {visibleLines.length === 0 ? (
                <p className="rounded border border-dashed px-2.5 py-1.5 text-[10px] leading-snug text-muted-foreground">
                  Sin insumos en {CATEGORY_LABELS[activeTab]}. Usá Total partida (ej. 500 kg) o unidad{" "}
                  {budgetUnitLabel(APU_GLOBAL_UNIT)} para importes.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="h-8">
                      <TableHead className="h-8 text-xs">Descripción</TableHead>
                      <TableHead className="h-8 text-xs">Un.</TableHead>
                      <TableHead className="h-8 text-right text-xs">Cant. recurso</TableHead>
                      <TableHead className="h-8 text-right text-xs">Precio</TableHead>
                      <TableHead className="h-8 text-right text-xs">Aporte /u</TableHead>
                      <TableHead className="h-8 text-right text-xs">Total partida</TableHead>
                      {editable && <TableHead className="h-8" />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleLines.map((line) => {
                      const partidaLineTotal = displayPartidaLineTotal(line, qtyN);
                      return (
                        <TableRow key={line.id} className="h-8">
                          <TableCell className="py-1 text-sm">{line.description}</TableCell>
                          <TableCell className="py-1 text-xs text-muted-foreground">
                            {budgetUnitLabel(line.unit) || line.unit}
                          </TableCell>
                          <TableCell className="py-1 text-right font-mono text-xs">
                            {displayResourceQtyLabel(line, qtyN)}
                          </TableCell>
                          <TableCell className="py-1 text-right font-mono text-xs">
                            {fmtNum(String(displayResourceUnitPrice(line, qtyN)))}
                          </TableCell>
                          <TableCell className="py-1 text-right font-mono text-xs">
                            {fmtNum(line.totalCost)}
                          </TableCell>
                          <TableCell className="py-1 text-right font-mono text-xs font-medium">
                            {fmtNum(String(partidaLineTotal))}
                          </TableCell>
                          {editable && (
                            <TableCell className="py-1">
                              <div className="flex gap-0.5">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => setEditLine(line)}
                                >
                                  <Pencil className="h-3 w-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-destructive"
                                  onClick={() => markDelete(line.id)}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}

              {legacyOtherLines.length > 0 && (
                <div className="space-y-1.5 rounded-md border border-amber-200 bg-amber-50/50 p-2">
                  <p className="text-[11px] font-medium text-amber-900">Líneas legacy (Otros)</p>
                  {legacyOtherLines.map((line) => (
                    <div key={line.id} className="flex items-center justify-between text-xs">
                      <span>{line.description}</span>
                      <Badge variant="secondary">{CATEGORY_LABELS.OTHER}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          <div className="flex justify-end gap-2 border-t px-5 py-2.5">
            <Button type="button" variant="outline" onClick={() => requestClose(false)} disabled={isPending}>
              Cancelar
            </Button>
            {editable && (
              <Button type="button" onClick={handleSave} disabled={isPending || !isDirty}>
                {isPending ? "Guardando..." : "Guardar cambios"}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={editLine !== null} onOpenChange={(o) => { if (!o) setEditLine(null); }}>
        <DialogContent>
          <DialogTitle>Editar línea APU</DialogTitle>
          {editLine && (
            <CostAnalysisLineForm
              mode="edit"
              defaults={(() => {
                const isTotal =
                  editLine.isLumpSum ||
                  (editLine.partidaQuantity != null && editLine.partidaQuantity !== "");
                if (!isTotal) {
                  return {
                    category: editLine.category,
                    description: editLine.description,
                    unit: editLine.unit,
                    coefficient: editLine.coefficient,
                    unitCost: editLine.unitCost,
                    notes: editLine.notes,
                    entryMode: "unit" as const,
                    wasLegacyLump: false,
                  };
                }
                const entry = toEntryApuLine({
                  mode: "total",
                  coefficient: parseFloat(editLine.coefficient) || 0,
                  unitCost: parseFloat(editLine.unitCost) || 0,
                  totalCost: parseFloat(editLine.totalCost) || 0,
                  partidaQuantity:
                    editLine.partidaQuantity != null && editLine.partidaQuantity !== ""
                      ? parseFloat(editLine.partidaQuantity)
                      : null,
                  isLumpSum: editLine.isLumpSum,
                  itemQuantity: qtyN,
                });
                // Legacy lump opens as Total partida 1 × importe; save converts to Global resource.
                return {
                  category: editLine.category,
                  description: editLine.description,
                  unit: editLine.isLumpSum ? APU_GLOBAL_UNIT : editLine.unit,
                  coefficient: String(entry.coefficient),
                  unitCost: String(entry.unitCost),
                  notes: editLine.notes,
                  entryMode: "total" as const,
                  wasLegacyLump: Boolean(editLine.isLumpSum),
                };
              })()}
              itemQuantity={qtyN}
              itemUnit={unit}
              toastOnSuccess={false}
              onSubmit={async (data: UpdateCostAnalysisLineInput) => {
                setLines((prev) =>
                  prev.map((l) =>
                    l.id === editLine.id
                      ? {
                          ...l,
                          category: (data.category ?? l.category) as string,
                          description: data.description ?? l.description,
                          unit: data.unit ?? l.unit,
                          coefficient: String(data.coefficient ?? l.coefficient),
                          unitCost: String(data.unitCost ?? l.unitCost),
                          totalCost: String(
                            data.totalCost ??
                              (parseFloat(String(data.coefficient ?? l.coefficient)) || 0) *
                                (parseFloat(String(data.unitCost ?? l.unitCost)) || 0),
                          ),
                          partidaQuantity:
                            data.partidaQuantity === undefined
                              ? l.partidaQuantity
                              : data.partidaQuantity == null
                                ? null
                                : String(data.partidaQuantity),
                          isLumpSum: data.isLumpSum ?? false,
                          notes: data.notes ?? l.notes,
                        }
                      : l,
                  ),
                );
                setEditLine(null);
                return { ok: true as const };
              }}
              onDone={() => setEditLine(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
