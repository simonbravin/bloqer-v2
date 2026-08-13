"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { ListEmptyState } from "@/components/ui/list-empty-state";
import { APU_GLOBAL_UNIT, toEntryApuLine } from "@bloqer/domain";
import { CostAnalysisLineForm } from "./cost-analysis-line-form";
import type { CostItemView, CostAnalysisLineView } from "@bloqer/services";
import type { CreateCostAnalysisLineInput, UpdateCostAnalysisLineInput, UpdateCostItemInput } from "@bloqer/validators";
import type { CostCategory } from "@bloqer/database";

import { CATEGORY_LABELS } from "@/lib/budget-categories";
import { budgetUnitLabel } from "@/lib/budget-units";
import { UnitSelect } from "./unit-select";
import { apuResourceQtyDisplay } from "../lib/wbs-apu-detail";
import { formatMoneyAmount, formatQtyFromString, formatUnitPriceFromString } from "@/lib/format-money";

interface CostItemPanelProps {
  costItem: CostItemView;
  currency: string;
  editable: boolean;
  onUpdateCostItem: (data: UpdateCostItemInput) => Promise<{ ok: true } | { error: string }>;
  onAddLine: (data: CreateCostAnalysisLineInput) => Promise<{ id: string } | { error: string }>;
  onUpdateLine: (lineId: string, data: UpdateCostAnalysisLineInput) => Promise<{ ok: true } | { error: string }>;
  onRemoveLine: (lineId: string) => Promise<{ ok: true } | { error: string }>;
}

type DialogState =
  | { type: "closed" }
  | { type: "add" }
  | { type: "edit"; line: CostAnalysisLineView };

export function CostItemPanel({
  costItem, currency, editable,
  onUpdateCostItem, onAddLine, onUpdateLine, onRemoveLine,
}: CostItemPanelProps) {
  const [dialogState, setDialogState] = useState<DialogState>({ type: "closed" });
  const [editingItem, setEditingItem] = useState(false);
  const [itemError, setItemError] = useState<string | null>(null);
  const [itemPending, startItemTransition] = useTransition();
  const [removePending, startRemoveTransition] = useTransition();

  // Local item form state
  const [unit, setUnit] = useState(costItem.unit);
  const [quantity, setQuantity] = useState(costItem.quantity);
  const [notes, setNotes] = useState(costItem.notes ?? "");

  function saveItemFields() {
    setItemError(null);
    startItemTransition(async () => {
      const result = await onUpdateCostItem({
        unit: unit || undefined,
        quantity: parseFloat(quantity) || undefined,
        notes: notes || undefined,
      });
      if ("error" in result) {
        setItemError(result.error);
        toast.error(result.error);
      } else {
        toast.success("Ítem actualizado");
        setEditingItem(false);
      }
    });
  }

  function handleRemoveLine(lineId: string) {
    if (!confirm("¿Eliminar esta línea de análisis?")) return;
    startRemoveTransition(async () => {
      const result = await onRemoveLine(lineId);
      if ("error" in result) {
        toast.error(result.error);
      } else {
        toast.success("Línea APU eliminada");
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* CostItem header */}
      <div className="form-section space-y-3 p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Datos del ítem</h3>
          {editable && !editingItem && (
            <Button variant="ghost" size="sm" onClick={() => setEditingItem(true)}>
              <Pencil className="h-3 w-3 mr-1" /> Editar
            </Button>
          )}
        </div>

        {editingItem ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Unidad</Label>
                <UnitSelect value={unit} onChange={setUnit} className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Cantidad</Label>
                <Input
                  className="h-8 text-sm font-mono"
                  type="number"
                  step="0.0001"
                  min="0"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Notas</Label>
              <Textarea
                className="text-sm"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
            {itemError && <p className="text-xs text-destructive">{itemError}</p>}
            <div className="flex gap-2">
              <Button size="sm" disabled={itemPending} onClick={saveItemFields}>
                {itemPending ? "Guardando..." : "Guardar"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditingItem(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <dl className="grid grid-cols-3 gap-3 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Unidad</dt>
              <dd className="font-medium">{costItem.unit || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Cantidad</dt>
              <dd className="font-mono font-medium">{formatQtyFromString(costItem.quantity)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Costo unit. directo</dt>
              <dd className="font-mono font-medium">{formatUnitPriceFromString(costItem.unitCostDirect)} {currency}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Precio unit. venta</dt>
              <dd className="font-mono font-medium">{formatUnitPriceFromString(costItem.unitSalePrice)} {currency}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Total costo directo</dt>
              <dd className="font-mono font-semibold">{formatMoneyAmount(costItem.totalCostDirect, currency)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Total precio venta</dt>
              <dd className="font-mono font-semibold">{formatMoneyAmount(costItem.totalSalePrice, currency)}</dd>
            </div>
          </dl>
        )}
      </div>

      {/* Analysis lines */}
      <div className="form-section overflow-hidden">
        <div className="flex items-center justify-between border-b border-border/80 px-4 py-3">
          <h3 className="text-sm font-semibold">Análisis de precio unitario (APU)</h3>
          {editable && (
            <Button size="sm" variant="outline" onClick={() => setDialogState({ type: "add" })}>
              <Plus className="h-3 w-3 mr-1" /> Agregar línea
            </Button>
          )}
        </div>

        {costItem.analysisLines.length === 0 ? (
          <ListEmptyState
            className="border-0 py-8"
            message="Sin líneas de APU. Agregá materiales, mano de obra y equipos."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cat.</TableHead>
                <TableHead>Descripción</TableHead>
                <TableHead>Un.</TableHead>
                <TableHead className="text-right">Cant.</TableHead>
                <TableHead className="text-right">Precio</TableHead>
                <TableHead className="text-right">Total</TableHead>
                {editable && <TableHead />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {costItem.analysisLines.map((line) => {
                const qtyDisp = apuResourceQtyDisplay(
                  line,
                  parseFloat(costItem.quantity) || 0,
                );
                return (
                <TableRow key={line.id}>
                  <TableCell>
                    <Badge variant="secondary" className="text-xs font-normal">
                      {CATEGORY_LABELS[line.category as CostCategory]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">{line.description}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {budgetUnitLabel(line.unit) || line.unit}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {qtyDisp.kind === "lump"
                      ? "—"
                      : formatQtyFromString(String(qtyDisp.qty))}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">{formatUnitPriceFromString(line.unitCost)}</TableCell>
                  <TableCell className="text-right font-mono text-sm font-medium">{formatUnitPriceFromString(line.totalCost)}</TableCell>
                  {editable && (
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => setDialogState({ type: "edit", line })}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          disabled={removePending}
                          onClick={() => handleRemoveLine(line.id)}
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
      </div>

      {/* Dialogs */}
      <Dialog
        open={dialogState.type !== "closed"}
        onOpenChange={(open) => { if (!open) setDialogState({ type: "closed" }); }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialogState.type === "add" ? "Agregar línea APU" : "Editar línea APU"}
            </DialogTitle>
          </DialogHeader>
          {dialogState.type === "add" && (
            <CostAnalysisLineForm
              mode="create"
              costItemId={costItem.id}
              nextSortOrder={costItem.analysisLines.length}
              itemQuantity={parseFloat(costItem.quantity) || 0}
              itemUnit={costItem.unit}
              onSubmit={onAddLine}
              onDone={() => setDialogState({ type: "closed" })}
            />
          )}
          {dialogState.type === "edit" && (
            <CostAnalysisLineForm
              mode="edit"
              defaults={(() => {
                const line = dialogState.line;
                const itemQty = parseFloat(costItem.quantity) || 0;
                const isTotal =
                  line.isLumpSum ||
                  (line.partidaQuantity != null && line.partidaQuantity !== "");
                if (!isTotal) {
                  return {
                    category: line.category,
                    description: line.description,
                    unit: line.unit,
                    coefficient: line.coefficient,
                    unitCost: line.unitCost,
                    notes: line.notes,
                    entryMode: "unit" as const,
                    wasLegacyLump: false,
                  };
                }
                const entry = toEntryApuLine({
                  mode: "total",
                  coefficient: parseFloat(line.coefficient) || 0,
                  unitCost: parseFloat(line.unitCost) || 0,
                  totalCost: parseFloat(line.totalCost) || 0,
                  partidaQuantity:
                    line.partidaQuantity != null && line.partidaQuantity !== ""
                      ? parseFloat(line.partidaQuantity)
                      : null,
                  isLumpSum: line.isLumpSum,
                  itemQuantity: itemQty,
                });
                return {
                  category: line.category,
                  description: line.description,
                  unit: line.isLumpSum ? APU_GLOBAL_UNIT : line.unit,
                  coefficient: String(entry.coefficient),
                  unitCost: String(entry.unitCost),
                  notes: line.notes,
                  entryMode: "total" as const,
                  wasLegacyLump: Boolean(line.isLumpSum),
                };
              })()}
              itemQuantity={parseFloat(costItem.quantity) || 0}
              itemUnit={costItem.unit}
              onSubmit={(data) => onUpdateLine(dialogState.type === "edit" ? dialogState.line.id : "", data)}
              onDone={() => setDialogState({ type: "closed" })}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
