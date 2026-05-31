"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
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
import type { WbsViewNode, CostAnalysisLineView, CostItemView } from "@bloqer/services";
import type {
  CreateCostAnalysisLineInput,
  UpdateCostAnalysisLineInput,
  UpdateCostItemInput,
} from "@bloqer/validators";
import type { CostCategory } from "@bloqer/database";

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

interface CostItemApuDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  node: WbsViewNode | null;
  currency: string;
  editable: boolean;
  onUpdateCostItem: (costItemId: string, data: UpdateCostItemInput) => Promise<{ ok: true } | { error: string }>;
  onAddLine: (data: CreateCostAnalysisLineInput) => Promise<{ id: string } | { error: string }>;
  onUpdateLine: (lineId: string, data: UpdateCostAnalysisLineInput) => Promise<{ ok: true } | { error: string }>;
  onRemoveLine: (lineId: string) => Promise<{ ok: true } | { error: string }>;
}

export function CostItemApuDialog({
  open,
  onOpenChange,
  node,
  currency,
  editable,
  onUpdateCostItem,
  onAddLine,
  onUpdateLine,
  onRemoveLine,
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

  const resetFromCostItem = useCallback((ci: CostItemView) => {
    setUnit(ci.unit);
    setQuantity(ci.quantity);
    setNotes(ci.notes ?? "");
    const initialLines = ci.analysisLines.map((l) => ({ ...l }));
    setLines(initialLines);
    setInitialSnapshot(
      buildApuSnapshot(ci.unit, ci.quantity, ci.notes ?? "", initialLines),
    );
    setNewDesc("");
    setNewUnit("un");
    setNewCoef("1");
    setNewUnitCost("0");
    setEditLine(null);
    setActiveTab("MATERIAL");
  }, []);

  useEffect(() => {
    if (open && costItem) resetFromCostItem(costItem);
  }, [open, costItem, resetFromCostItem]);

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
    if (!unitByCategory) return 0;
    return (
      unitByCategory.MATERIAL +
      unitByCategory.LABOR +
      unitByCategory.EQUIPMENT +
      unitByCategory.SUBCONTRACT
    );
  }, [unitByCategory]);

  const qtyN = parseFloat(quantity) || 0;
  const totalProjectCost = unitCostDirect * qtyN;

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
    const coef = parseFloat(newCoef) || 0;
    const uc = parseFloat(newUnitCost) || 0;
    const totalCost = String(coef * uc);
    const tempId = `temp_${crypto.randomUUID()}`;
    setLines((prev) => [
      ...prev,
      {
        id: tempId,
        category: activeTab,
        description: newDesc.trim(),
        unit: newUnit,
        coefficient: String(coef),
        unitCost: String(uc),
        totalCost,
        sortOrder: prev.filter((l) => !l._deleted).length,
        supplierContactId: null,
        notes: null,
        _isNew: true,
      },
    ]);
    setNewDesc("");
    setNewCoef("1");
    setNewUnitCost("0");
  }

  function markDelete(lineId: string) {
    setLines((prev) =>
      prev.map((l) => (l.id === lineId ? { ...l, _deleted: true } : l)),
    );
  }

  function handleSave() {
    if (!costItem || !node?.costItem || !initialSnapshot) return;
    startTransition(async () => {
      const orig = JSON.parse(initialSnapshot) as {
        unit: string;
        quantity: string;
        notes: string;
      };

      const qty = parseQuantityInput(quantity);
      const origQty = parseQuantityInput(orig.quantity);

      if (unit !== orig.unit || qty !== origQty || notes !== orig.notes) {
        const result = await onUpdateCostItem(costItem.id, {
          unit: unit || undefined,
          ...(qty !== undefined ? { quantity: qty } : {}),
          notes: notes || undefined,
        });
        if ("error" in result) {
          toast.error(result.error);
          return;
        }
      }

      for (const line of lines) {
        if (line._deleted && !line._isNew) {
          const result = await onRemoveLine(line.id);
          if ("error" in result) {
            toast.error(result.error);
            return;
          }
        }
      }

      for (const line of lines) {
        if (line._isNew && !line._deleted) {
          const result = await onAddLine({
            costItemId: costItem.id,
            category: line.category as CostCategory,
            description: line.description,
            unit: line.unit,
            coefficient: parseFloat(line.coefficient),
            unitCost: parseFloat(line.unitCost),
            sortOrder: line.sortOrder,
            notes: line.notes ?? undefined,
          });
          if ("error" in result) {
            toast.error(result.error);
            return;
          }
        }
      }

      const origLines: CostAnalysisLineView[] = JSON.parse(initialSnapshot).lines ?? [];
      for (const line of lines) {
        if (line._isNew || line._deleted) continue;
        const origLine = origLines.find((o) => o.id === line.id);
        if (!origLine) continue;
        const changed =
          origLine.description !== line.description ||
          origLine.unit !== line.unit ||
          origLine.coefficient !== line.coefficient ||
          origLine.unitCost !== line.unitCost ||
          origLine.category !== line.category ||
          (origLine.notes ?? "") !== (line.notes ?? "");
        if (changed) {
          const result = await onUpdateLine(line.id, {
            category: line.category as CostCategory,
            description: line.description,
            unit: line.unit,
            coefficient: parseFloat(line.coefficient),
            unitCost: parseFloat(line.unitCost),
            notes: line.notes ?? undefined,
          });
          if ("error" in result) {
            toast.error(result.error);
            return;
          }
        }
      }

      toast.success("Cambios guardados");
      router.refresh();
      onOpenChange(false);
    });
  }

  if (!canShowApu || !costItem) return null;

  const saleTotal = parseFloat(costItem.totalSalePrice) || 0;

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
                  <p className="text-xs text-muted-foreground">{CATEGORY_LABELS[cat]}</p>
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
                  Total partida: {fmtMoney(String(totalProjectCost), currency)} ({fmtNum(quantity)} {budgetUnitLabel(unit)})
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
                      className="h-9 font-mono"
                    />
                  ) : (
                    <p className="text-sm font-mono font-medium">{fmtNum(quantity)}</p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">PU venta</Label>
                  <p className="text-sm font-mono">{fmtMoney(costItem.unitSalePrice, currency)}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Total venta</Label>
                  <p className="text-sm font-mono font-semibold">{fmtMoney(String(saleTotal), currency)}</p>
                </div>
              </div>
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
                  message="Aún no hay recursos en esta categoría. Usá el formulario debajo para agregar."
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Descripción</TableHead>
                      <TableHead>Un.</TableHead>
                      <TableHead className="text-right">Coef.</TableHead>
                      <TableHead className="text-right">C. unit.</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      {editable && <TableHead />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleLines.map((line) => (
                      <TableRow key={line.id}>
                        <TableCell className="text-sm">{line.description}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{line.unit}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{fmtNum(line.coefficient)}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{fmtNum(line.unitCost)}</TableCell>
                        <TableCell className="text-right font-mono text-sm font-medium">{fmtNum(line.totalCost)}</TableCell>
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
                    ))}
                  </TableBody>
                </Table>
              )}

              {editable && (
                <div className="rounded-lg border border-dashed bg-muted/20 p-4 space-y-3">
                  <p className="text-sm font-medium">Agregar {CATEGORY_LABELS[activeTab]}</p>
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
                      <Label className="text-xs">Cantidad</Label>
                      <Input value={newCoef} onChange={(e) => setNewCoef(e.target.value)} className="font-mono" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Precio</Label>
                      <Input value={newUnitCost} onChange={(e) => setNewUnitCost(e.target.value)} className="font-mono" />
                    </div>
                    <Button type="button" size="sm" onClick={addInlineLine}>
                      <Plus className="h-3 w-3 mr-1" /> Agregar
                    </Button>
                  </div>
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
              defaults={editLine}
              onSubmit={async (data) => {
                const coef = parseFloat(String(data.coefficient ?? editLine.coefficient)) || 0;
                const uc = parseFloat(String(data.unitCost ?? editLine.unitCost)) || 0;
                setLines((prev) =>
                  prev.map((l) =>
                    l.id === editLine.id
                      ? {
                          ...l,
                          category: (data.category ?? l.category) as string,
                          description: data.description ?? l.description,
                          unit: data.unit ?? l.unit,
                          coefficient: String(coef),
                          unitCost: String(uc),
                          totalCost: String(coef * uc),
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
