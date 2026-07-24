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
import { ListEmptyState } from "@/components/ui/list-empty-state";
import { formatMoneyAmount } from "@/lib/format-money";
import { CATEGORY_LABELS, VISIBLE_COST_CATEGORIES, type VisibleCostCategory } from "@/lib/budget-categories";
import { budgetUnitLabel } from "@/lib/budget-units";
import { UnitSelect } from "./unit-select";
import { CostAnalysisLineForm } from "./cost-analysis-line-form";
import { ApuEntryModeToggle, ApuTotalKindToggle } from "./apu-entry-mode-toggle";
import type { WbsViewNode, CostAnalysisLineView, CostItemView } from "@bloqer/services";
import type { SaveCostItemApuInput, UpdateCostAnalysisLineInput } from "@bloqer/validators";
import type { CostCategory } from "@bloqer/database";
import {
  canUseTotalPartidaMode,
  convertApuEntryMode,
  normalizeStoredApuLineForItemQuantity,
  previewApuEntry,
  recomputeLumpForItemQuantity,
  recomputeResourceForItemQuantity,
  toEntryApuLine,
  toStoredApuLine,
  type ApuEntryMode,
  type ApuTotalKind,
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
  return new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(parseFloat(value) || 0);
}

function fmtMoney(value: string, currency: string) {
  return formatMoneyAmount(value, currency);
}

function displayResourceQtyLabel(line: LocalLine, itemQty: number): string {
  const d = apuResourceQtyDisplay(line, itemQty);
  if (d.kind === "lump") return "global";
  return new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(d.qty);
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
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LocalLine[]>([]);
  const [initialSnapshot, setInitialSnapshot] = useState<string>("");

  const [newDesc, setNewDesc] = useState("");
  const [newUnit, setNewUnit] = useState("un");
  const [newCoef, setNewCoef] = useState("1");
  const [newUnitCost, setNewUnitCost] = useState("0");
  const [entryMode, setEntryMode] = useState<ApuEntryMode>("total");
  const [totalKind, setTotalKind] = useState<ApuTotalKind>("resource");
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
    setTotalKind("resource");
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

  useEffect(() => {
    if (entryMode !== "total") return;
    setTotalKind(activeTab === "LABOR" ? "lump" : "resource");
  }, [activeTab, entryMode]);

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
        totalKind,
        coefficient: parseFloat(newCoef) || 0,
        unitCost: parseFloat(newUnitCost) || 0,
        itemQuantity: qtyN,
      }),
    [entryMode, totalKind, newCoef, newUnitCost, qtyN],
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
    const itemQty = parseFloat(quantity) || 0;
    if (entryMode === "total" && !canUseTotalPartidaMode(itemQty)) {
      toast.error("Definí la cantidad del ítem para cargar por total de partida");
      return;
    }
    // Align existing lines to the qty used for the new row (blur may not have run yet).
    const baseLines = syncLinesToQuantity(itemQty);
    const coefInput = parseFloat(newCoef) || 0;
    const ucInput = parseFloat(newUnitCost) || 0;
    const stored = toStoredApuLine({
      mode: entryMode,
      totalKind,
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
        unit: newUnit,
        coefficient: String(stored.coefficient),
        unitCost: String(stored.unitCost),
        totalCost: String(stored.totalCost),
        partidaQuantity: stored.partidaQuantity != null ? String(stored.partidaQuantity) : null,
        isLumpSum: stored.isLumpSum,
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
        totalKind,
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
      const payload: SaveCostItemApuInput = {
        costItemId: costItem.id,
        unit: unit || undefined,
        quantity: qty,
        notes: notes || null,
        lines: syncedLines
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
        <DialogContent className="flex max-h-[90vh] max-w-5xl flex-col gap-0 overflow-hidden p-0 pr-12">
          <div className="border-b px-6 py-4">
            <DialogTitle className="text-lg pr-6">
              APU — Análisis de precio unitario
            </DialogTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              <span className="font-mono">{node.code}</span> — {node.name}
            </p>
            {node.description?.trim() ? (
              <p className="mt-2 text-sm leading-relaxed text-foreground">{node.description.trim()}</p>
            ) : null}
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {VISIBLE_COST_CATEGORIES.map((cat) => (
                <div key={cat} className="rounded-lg border bg-card p-3 text-center">
                  <p className="text-xs text-muted-foreground">{CATEGORY_LABELS[cat]} / und.</p>
                  <p className="font-mono text-sm font-semibold tabular-nums">
                    {fmtMoney(String(unitByCategory[cat]), currency)}
                  </p>
                </div>
              ))}
              <div className="rounded-lg border-2 border-primary/20 bg-primary/5 p-3 text-center col-span-2 sm:col-span-1">
                <p className="text-xs text-muted-foreground">Costo directo unit.</p>
                <p className="font-mono text-sm font-bold tabular-nums">
                  {fmtMoney(String(unitCostDirect), currency)}
                </p>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  CD total: {fmtMoney(String(totalProjectCost), currency)} ({fmtNum(quantity)} {itemUnitLabel})
                </p>
              </div>
            </div>

            <div className="rounded-lg border p-4 space-y-3">
              <h3 className="text-sm font-semibold">Datos del ítem</h3>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="space-y-1">
                  <Label className="text-xs">Unidad</Label>
                  {editable ? (
                    <UnitSelect value={unit} onChange={setUnit} className="h-9" />
                  ) : (
                    <p className="text-sm font-medium">{unit || "—"}</p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Cantidad</Label>
                  {editable ? (
                    <Input
                      type="number"
                      step="0.0001"
                      min="0"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      onBlur={() => {
                        const next = parseFloat(quantity) || 0;
                        if (next > 0) syncLinesToQuantity(next);
                      }}
                      className="h-9 font-mono"
                    />
                  ) : (
                    <p className="text-sm font-mono font-medium">{fmtNum(quantity)}</p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">CD unitario</Label>
                  <p className="text-sm font-mono font-medium">{fmtMoney(String(unitCostDirect), currency)}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">CD total</Label>
                  <p className="text-sm font-mono font-semibold">{fmtMoney(String(totalProjectCost), currency)}</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                El precio de venta se ve y calcula en la tabla EDT (márgenes del presupuesto).
              </p>
              {editable && (
                <div className="space-y-1">
                  <Label className="text-xs">Notas</Label>
                  <Textarea
                    rows={1}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="min-h-8 resize-y text-sm"
                  />
                </div>
              )}
            </div>

            <div className="space-y-3">
              <div className="flex flex-wrap gap-1">
                {VISIBLE_COST_CATEGORIES.map((cat) => {
                  const count = lines.filter((l) => !l._deleted && l.category === cat).length;
                  return (
                    <Button
                      key={cat}
                      type="button"
                      size="sm"
                      variant={activeTab === cat ? "default" : "outline"}
                      className="text-xs"
                      onClick={() => setActiveTab(cat)}
                    >
                      {CATEGORY_LABELS[cat]} ({count})
                    </Button>
                  );
                })}
              </div>

              {visibleLines.length === 0 ? (
                <ListEmptyState
                  className="border border-dashed py-8"
                  message="Ej.: Zapata corrida — cargá 500 un de hierro en Total partida → Cant. recurso. Los insumos van acá, no como ítems hijos del WBS."
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Descripción</TableHead>
                      <TableHead>Un.</TableHead>
                      <TableHead className="text-right">Cant. recurso</TableHead>
                      <TableHead className="text-right">Precio</TableHead>
                      <TableHead className="text-right">Aporte / und.</TableHead>
                      <TableHead className="text-right">Total partida</TableHead>
                      {editable && <TableHead />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleLines.map((line) => {
                      const partidaLineTotal = displayPartidaLineTotal(line, qtyN);
                      return (
                        <TableRow key={line.id}>
                          <TableCell className="text-sm">{line.description}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{line.unit}</TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {displayResourceQtyLabel(line, qtyN)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">{fmtNum(line.unitCost)}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{fmtNum(line.totalCost)}</TableCell>
                          <TableCell className="text-right font-mono text-sm font-medium">
                            {fmtNum(String(partidaLineTotal))}
                          </TableCell>
                          {editable && (
                            <TableCell>
                              <div className="flex gap-1">
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

              {editable && (
                <div className="rounded-lg border border-dashed shell-surface-inset p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium">Agregar {CATEGORY_LABELS[activeTab]}</p>
                    <div className="flex flex-wrap gap-2">
                      <ApuEntryModeToggle
                        value={entryMode}
                        onChange={handleEntryModeChange}
                        totalDisabled={!canUseTotalPartidaMode(parseFloat(quantity) || 0)}
                      />
                      {entryMode === "total" && (
                        <ApuTotalKindToggle value={totalKind} onChange={setTotalKind} />
                      )}
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {entryMode === "total"
                      ? totalKind === "resource"
                        ? "Cant. recurso = necesidad de toda la partida (ej. 500 un). No se vuelve a multiplicar por la cantidad del ítem."
                        : "Monto global = importe total de la partida; se prorratea al costo unitario del ítem."
                      : `Por unidad = consumo por 1 ${itemUnitLabel} del ítem; el total de partida = aporte × cantidad.`}
                  </p>
                  <div className="grid gap-3 sm:grid-cols-[1fr_6rem_5rem_6rem_auto] sm:items-end">
                    <div className="space-y-1">
                      <Label className="text-xs">Descripción</Label>
                      <Input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Nombre" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Unidad</Label>
                      <UnitSelect value={newUnit} onChange={setNewUnit} className="h-9" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">
                        {entryMode === "total" && totalKind === "lump" ? "Cant." : entryMode === "total" ? "Cant. recurso" : "Rendim."}
                      </Label>
                      <Input value={newCoef} onChange={(e) => setNewCoef(e.target.value)} className="font-mono" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">
                        {entryMode === "total" && totalKind === "lump" ? "Monto" : "Precio"}
                      </Label>
                      <Input value={newUnitCost} onChange={(e) => setNewUnitCost(e.target.value)} className="font-mono" />
                    </div>
                    <Button type="button" size="sm" onClick={addInlineLine}>
                      <Plus className="h-3 w-3 mr-1" /> Agregar
                    </Button>
                  </div>
                  <p className="font-mono text-[11px] text-muted-foreground space-x-3">
                    <span>Necesidad: {fmtNum(String(entryPreview.resourceNeed))}</span>
                    {entryPreview.yieldPerItemUnit != null && (
                      <span>
                        Rendimiento / {itemUnitLabel}: {fmtNum(String(entryPreview.yieldPerItemUnit))}
                      </span>
                    )}
                    <span>Aporte / und.: {fmtNum(String(entryPreview.unitTotal))}</span>
                    <span>Total partida: {fmtNum(String(entryPreview.partidaTotal))}</span>
                  </p>
                </div>
              )}

              {legacyOtherLines.length > 0 && (
                <div className="rounded-md border border-amber-200 bg-amber-50/50 p-3 space-y-2">
                  <p className="text-xs font-medium text-amber-900">Líneas legacy (Otros)</p>
                  {legacyOtherLines.map((line) => (
                    <div key={line.id} className="flex items-center justify-between text-sm">
                      <span>{line.description}</span>
                      <Badge variant="secondary">{CATEGORY_LABELS.OTHER}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t px-6 py-4">
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
                    totalKind: "resource" as const,
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
                return {
                  category: editLine.category,
                  description: editLine.description,
                  unit: editLine.unit,
                  coefficient: String(entry.coefficient),
                  unitCost: String(entry.unitCost),
                  notes: editLine.notes,
                  entryMode: "total" as const,
                  totalKind: entry.totalKind,
                };
              })()}
              itemQuantity={qtyN}
              itemUnit={unit}
              toastOnSuccess={false}
              onSubmit={async (data: UpdateCostAnalysisLineInput) => {
                // CostAnalysisLineForm already runs toStoredApuLine
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
                          isLumpSum: data.isLumpSum ?? l.isLumpSum,
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
