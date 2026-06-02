"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  SearchableCombobox,
  wbsToSearchableOptions,
} from "@/components/ui/searchable-combobox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { TableScroll } from "@/components/ui/table-scroll";
import { Plus, Pencil, Trash2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CertificationLineView } from "@bloqer/services";
import type {
  AddCertificationLineInput, UpdateCertificationLineInput,
} from "@bloqer/validators";

function fmt4(v: string) {
  return new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(parseFloat(v));
}

function fmt2(v: string) {
  return new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(parseFloat(v));
}

export type WbsItemOption = { id: string; code: string; name: string; unit: string };

type AddDialogState = { type: "closed" } | { type: "add" } | { type: "edit"; line: CertificationLineView };

interface CertificationLineEditorProps {
  certificationId: string;
  lines: CertificationLineView[];
  availableItems: WbsItemOption[];
  currency: string;
  editable: boolean;
  onAddLine:    (data: AddCertificationLineInput) => Promise<{ id: string } | { error: string }>;
  onUpdateLine: (lineId: string, data: UpdateCertificationLineInput) => Promise<{ ok: true } | { error: string }>;
  onRemoveLine: (lineId: string) => Promise<{ ok: true } | { error: string }>;
  onRefresh:    () => Promise<{ ok: true } | { error: string }>;
}

export function CertificationLineEditor({
  certificationId, lines, availableItems, currency, editable,
  onAddLine, onUpdateLine, onRemoveLine, onRefresh,
}: CertificationLineEditorProps) {
  const [dialogState, setDialogState] = useState<AddDialogState>({ type: "closed" });
  const [removePending, startRemoveTransition] = useTransition();
  const [refreshPending, startRefreshTransition] = useTransition();

  const usedNodeIds = new Set(lines.map((l) => l.wbsNodeId));
  const remaining = availableItems.filter((i) => !usedNodeIds.has(i.id));

  function handleRemove(lineId: string) {
    if (!confirm("¿Eliminar esta línea de la certificación?")) return;
    startRemoveTransition(async () => { await onRemoveLine(lineId); });
  }

  function handleRefresh() {
    startRefreshTransition(async () => { await onRefresh(); });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Ítems certificados</h3>
        {editable && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={refreshPending}
              onClick={handleRefresh}
              title="Recalcular cantidades certificadas previas"
            >
              <RefreshCw className={cn("h-3 w-3 mr-1", refreshPending && "animate-spin")} />
              Actualizar previos
            </Button>
            {remaining.length > 0 && (
              <Button size="sm" variant="outline" onClick={() => setDialogState({ type: "add" })}>
                <Plus className="h-3 w-3 mr-1" /> Agregar ítem
              </Button>
            )}
          </div>
        )}
      </div>

      {lines.length === 0 ? (
        <p className="rounded-lg border px-4 py-8 text-center text-sm text-muted-foreground">
          Sin ítems. Agregue los ítems a certificar en este período.
        </p>
      ) : (
        <TableScroll>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Ítem</TableHead>
                <TableHead>Un.</TableHead>
                <TableHead className="text-right">Qty Ppto.</TableHead>
                <TableHead className="text-right">Qty Prev.</TableHead>
                <TableHead className="text-right">Qty Período</TableHead>
                <TableHead className="text-right">% Físico</TableHead>
                <TableHead className="text-right">Qty Acum.</TableHead>
                <TableHead className="text-right">Qty Rest.</TableHead>
                <TableHead className="text-right">Monto Período</TableHead>
                {editable && <TableHead />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((line) => {
                const isOverCert = parseFloat(line.cumulativeQty) > parseFloat(line.budgetQty);
                return (
                  <TableRow
                    key={line.id}
                    className={cn(isOverCert && "bg-amber-50 dark:bg-amber-950/20")}
                  >
                    <TableCell className="font-mono text-xs">{line.wbsNode.code}</TableCell>
                    <TableCell className="text-sm max-w-[200px] truncate">{line.wbsNode.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{line.wbsNode.unit}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{fmt4(line.budgetQty)}</TableCell>
                    <TableCell className="text-right font-mono text-sm text-muted-foreground">{fmt4(line.previousQty)}</TableCell>
                    <TableCell className="text-right font-mono text-sm font-medium">{fmt4(line.currentQty)}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{fmt4(line.physicalPct)}%</TableCell>
                    <TableCell className={cn("text-right font-mono text-sm font-semibold", isOverCert && "text-amber-600 dark:text-amber-400")}>
                      {fmt4(line.cumulativeQty)}
                      {isOverCert && (
                        <Badge variant="outline" className="ml-1 text-xs border-amber-500 text-amber-600 dark:text-amber-400">
                          Supera
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className={cn("text-right font-mono text-sm", parseFloat(line.remainingQty) < 0 && "text-amber-600 dark:text-amber-400")}>
                      {fmt4(line.remainingQty)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm font-medium">
                      {fmt2(line.periodAmount)} {currency}
                    </TableCell>
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
                            onClick={() => handleRemove(line.id)}
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
        </TableScroll>
      )}

      {/* Add / Edit dialog */}
      <Dialog
        open={dialogState.type !== "closed"}
        onOpenChange={(open) => { if (!open) setDialogState({ type: "closed" }); }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialogState.type === "add" ? "Agregar ítem certificado" : "Editar ítem certificado"}
            </DialogTitle>
          </DialogHeader>

          {dialogState.type === "add" && (
            <AddLineForm
              certificationId={certificationId}
              items={remaining}
              onSubmit={onAddLine}
              onDone={() => setDialogState({ type: "closed" })}
            />
          )}
          {dialogState.type === "edit" && (
            <EditLineForm
              line={dialogState.line}
              onSubmit={(data) =>
                onUpdateLine(dialogState.type === "edit" ? dialogState.line.id : "", data)
              }
              onDone={() => setDialogState({ type: "closed" })}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Add form ─────────────────────────────────────────────────────────────────

function AddLineForm({
  certificationId, items, onSubmit, onDone,
}: {
  certificationId: string;
  items: WbsItemOption[];
  onSubmit: (data: AddCertificationLineInput) => Promise<{ id: string } | { error: string }>;
  onDone: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [wbsNodeId, setWbsNodeId] = useState(items[0]?.id ?? "");
  const [physicalPct, setPhysicalPct] = useState("0");
  const [currentQty, setCurrentQty] = useState("0");
  const [notes, setNotes] = useState("");
  const wbsOptions = useMemo(() => wbsToSearchableOptions(items), [items]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await onSubmit({
        certificationId,
        wbsNodeId,
        physicalPct: parseFloat(physicalPct) || 0,
        currentQty: parseFloat(currentQty) || 0,
        notes: notes || undefined,
      });
      if ("error" in result) {
        setError(result.error);
      } else {
        onDone();
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label>Ítem WBS *</Label>
        <SearchableCombobox
          popoverWidth="wide"
          options={wbsOptions}
          value={wbsNodeId}
          onValueChange={setWbsNodeId}
          placeholder="Seleccionar ítem…"
          searchPlaceholder="Buscar partida…"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Cantidad económica certificada</Label>
          <Input
            type="number"
            step="0.0001"
            min="0"
            value={currentQty}
            onChange={(e) => setCurrentQty(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>% Físico</Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            max="100"
            value={physicalPct}
            onChange={(e) => setPhysicalPct(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Notas</Label>
        <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onDone} disabled={isPending}>
          Cancelar
        </Button>
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? "Guardando..." : "Agregar"}
        </Button>
      </div>
    </form>
  );
}

// ─── Edit form ────────────────────────────────────────────────────────────────

function EditLineForm({
  line, onSubmit, onDone,
}: {
  line: CertificationLineView;
  onSubmit: (data: UpdateCertificationLineInput) => Promise<{ ok: true } | { error: string }>;
  onDone: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [physicalPct, setPhysicalPct] = useState(line.physicalPct);
  const [currentQty, setCurrentQty] = useState(line.currentQty);
  const [notes, setNotes] = useState(line.notes ?? "");

  // Client-side preview of cumulative
  const previewCumulative = (parseFloat(line.previousQty) + (parseFloat(currentQty) || 0)).toFixed(4);
  const isOver = parseFloat(previewCumulative) > parseFloat(line.budgetQty);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await onSubmit({
        physicalPct: parseFloat(physicalPct) || 0,
        currentQty:  parseFloat(currentQty)  || 0,
        notes: notes || undefined,
      });
      if ("error" in result) {
        setError(result.error);
      } else {
        onDone();
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
        <span className="font-mono font-medium">{line.wbsNode.code}</span> — {line.wbsNode.name}
        <span className="ml-2 text-muted-foreground">({line.wbsNode.unit})</span>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm text-muted-foreground">
        <div>
          <p className="text-xs">Qty presupuestada</p>
          <p className="font-mono font-medium text-foreground">{fmt4(line.budgetQty)}</p>
        </div>
        <div>
          <p className="text-xs">Qty certificada previa</p>
          <p className="font-mono font-medium text-foreground">{fmt4(line.previousQty)}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Cantidad económica certificada</Label>
          <Input
            type="number"
            step="0.0001"
            min="0"
            value={currentQty}
            onChange={(e) => setCurrentQty(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>% Físico</Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            max="100"
            value={physicalPct}
            onChange={(e) => setPhysicalPct(e.target.value)}
          />
        </div>
      </div>

      {isOver && (
        <div className="rounded-md border border-amber-400 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
          Aviso: la cantidad acumulada ({previewCumulative}) supera el presupuesto ({fmt4(line.budgetQty)}).
          En obra pública esto bloqueará la emisión.
        </div>
      )}

      <div className="space-y-1.5">
        <Label>Notas</Label>
        <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onDone} disabled={isPending}>
          Cancelar
        </Button>
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? "Guardando..." : "Guardar"}
        </Button>
      </div>
    </form>
  );
}
