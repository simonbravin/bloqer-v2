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
import { CostAnalysisLineForm } from "./cost-analysis-line-form";
import type { CostItemView, CostAnalysisLineView } from "@bloqer/services";
import type { CreateCostAnalysisLineInput, UpdateCostAnalysisLineInput, UpdateCostItemInput } from "@bloqer/validators";
import type { CostCategory } from "@bloqer/database";

const CATEGORY_LABELS: Record<CostCategory, string> = {
  MATERIAL:    "Material",
  LABOR:       "M.O.",
  EQUIPMENT:   "Equipos",
  SUBCONTRACT: "Subcontrato",
  OTHER:       "Otros",
};

function fmt(value: string) {
  return new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(parseFloat(value));
}

function fmt2(value: string) {
  return new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(parseFloat(value));
}

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
      <div className="rounded-lg border p-4 space-y-3">
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
                <Input
                  className="h-8 text-sm"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                />
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
              <dd className="font-mono font-medium">{fmt(costItem.quantity)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Costo unit. directo</dt>
              <dd className="font-mono font-medium">{fmt2(costItem.unitCostDirect)} {currency}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Precio unit. venta</dt>
              <dd className="font-mono font-medium">{fmt2(costItem.unitSalePrice)} {currency}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Total costo directo</dt>
              <dd className="font-mono font-semibold">{fmt2(costItem.totalCostDirect)} {currency}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Total precio venta</dt>
              <dd className="font-mono font-semibold">{fmt2(costItem.totalSalePrice)} {currency}</dd>
            </div>
          </dl>
        )}
      </div>

      {/* Analysis lines */}
      <div className="rounded-lg border">
        <div className="flex items-center justify-between border-b px-4 py-3">
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
                <TableHead className="text-right">Coef.</TableHead>
                <TableHead className="text-right">C.Unit.</TableHead>
                <TableHead className="text-right">Total</TableHead>
                {editable && <TableHead />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {costItem.analysisLines.map((line) => (
                <TableRow key={line.id}>
                  <TableCell>
                    <Badge variant="secondary" className="text-xs font-normal">
                      {CATEGORY_LABELS[line.category as CostCategory]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">{line.description}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{line.unit}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{fmt(line.coefficient)}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{fmt2(line.unitCost)}</TableCell>
                  <TableCell className="text-right font-mono text-sm font-medium">{fmt2(line.totalCost)}</TableCell>
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
              ))}
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
              onSubmit={onAddLine}
              onDone={() => setDialogState({ type: "closed" })}
            />
          )}
          {dialogState.type === "edit" && (
            <CostAnalysisLineForm
              mode="edit"
              defaults={dialogState.line}
              onSubmit={(data) => onUpdateLine(dialogState.type === "edit" ? dialogState.line.id : "", data)}
              onDone={() => setDialogState({ type: "closed" })}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
