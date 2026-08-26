"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DecimalInput, numberFromCanonicalDecimal } from "@/components/ui/decimal-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { SearchableCombobox } from "@/components/ui/searchable-combobox";
import { wbsToSearchableOptions } from "@/lib/searchable-options";
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
import { addDecimal, multiplyDecimal, roundQty } from "@bloqer/utils";
import {
  compareQty,
  formatMoneyAmount,
  formatQtyFromString,
  formatRatePctWithSymbol,
  formatUnitPriceFromString,
  isNegativeQty,
} from "@/lib/format-money";

export type WbsItemOption = {
  id: string;
  code: string;
  name: string;
  unit: string;
  budgetQty?: string;
  previousQty?: string;
  remainingQty?: string;
  unitSalePrice?: string;
};

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
  const router = useRouter();
  const [dialogState, setDialogState] = useState<AddDialogState>({ type: "closed" });
  const [removePending, startRemoveTransition] = useTransition();
  const [refreshPending, startRefreshTransition] = useTransition();

  const usedNodeIds = new Set(lines.map((l) => l.wbsNodeId));
  const remaining = availableItems.filter((i) => !usedNodeIds.has(i.id));

  function handleRemove(lineId: string) {
    if (!confirm("¿Eliminar esta línea de la certificación?")) return;
    startRemoveTransition(async () => {
      const result = await onRemoveLine(lineId);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      router.refresh();
    });
  }

  function handleRefresh() {
    startRefreshTransition(async () => {
      const result = await onRefresh();
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      router.refresh();
    });
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
                const isOverCert = compareQty(line.cumulativeQty, line.budgetQty) > 0;
                return (
                  <TableRow
                    key={line.id}
                    className={cn(isOverCert && "bg-amber-50 dark:bg-amber-950/20")}
                  >
                    <TableCell className="font-mono text-xs">{line.wbsNode.code}</TableCell>
                    <TableCell className="text-sm max-w-[200px] truncate">{line.wbsNode.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{line.wbsNode.unit}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{formatQtyFromString(line.budgetQty)}</TableCell>
                    <TableCell className="text-right font-mono text-sm text-muted-foreground">{formatQtyFromString(line.previousQty)}</TableCell>
                    <TableCell className="text-right font-mono text-sm font-medium">{formatQtyFromString(line.currentQty)}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{formatRatePctWithSymbol(line.physicalPct)}</TableCell>
                    <TableCell className={cn("text-right font-mono text-sm font-semibold", isOverCert && "text-amber-600 dark:text-amber-400")}>
                      {formatQtyFromString(line.cumulativeQty)}
                      {isOverCert && (
                        <Badge variant="outline" className="ml-1 text-xs border-amber-500 text-amber-600 dark:text-amber-400">
                          Supera
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className={cn("text-right font-mono text-sm", isNegativeQty(line.remainingQty) && "text-amber-600 dark:text-amber-400")}>
                      {formatQtyFromString(line.remainingQty)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm font-medium">
                      {formatMoneyAmount(line.periodAmount)} {currency}
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
              onDone={() => {
                setDialogState({ type: "closed" });
                router.refresh();
              }}
            />
          )}
          {dialogState.type === "edit" && (
            <EditLineForm
              line={dialogState.line}
              onSubmit={(data) =>
                onUpdateLine(dialogState.type === "edit" ? dialogState.line.id : "", data)
              }
              onDone={() => {
                setDialogState({ type: "closed" });
                router.refresh();
              }}
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
  const selected = items.find((i) => i.id === wbsNodeId);
  const [physicalPct, setPhysicalPct] = useState("0");
  const [currentQty, setCurrentQty] = useState(() => {
    const rem = items[0]?.remainingQty;
    return rem != null && rem !== "" ? rem : "0";
  });
  const [notes, setNotes] = useState("");
  const wbsOptions = useMemo(() => wbsToSearchableOptions(items), [items]);

  function onWbsChange(id: string) {
    setWbsNodeId(id);
    const item = items.find((i) => i.id === id);
    if (item?.remainingQty != null && item.remainingQty !== "") {
      setCurrentQty(item.remainingQty);
    }
  }

  const previewCumulative = (() => {
    try {
      return roundQty(addDecimal(selected?.previousQty ?? "0", currentQty || "0"));
    } catch {
      return selected?.previousQty ?? "0.0000";
    }
  })();
  const budgetQty = selected?.budgetQty ?? "0";
  const isOver = selected != null && compareQty(previewCumulative, budgetQty) > 0;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await onSubmit({
        certificationId,
        wbsNodeId,
        physicalPct: numberFromCanonicalDecimal(physicalPct),
        currentQty: numberFromCanonicalDecimal(currentQty),
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
        <Label>Ítem EDT *</Label>
        <SearchableCombobox
          popoverWidth="wide"
          options={wbsOptions}
          value={wbsNodeId}
          onValueChange={onWbsChange}
          placeholder="Seleccionar ítem…"
          searchPlaceholder="Buscar partida…"
        />
        {selected ? (
          <p className="text-xs text-muted-foreground">
            Unidad: {selected.unit || "—"}
            {selected.unitSalePrice != null
              ? ` · PU venta ${formatUnitPriceFromString(selected.unitSalePrice)}`
              : ""}
          </p>
        ) : null}
      </div>

      {selected ? (
        <div className="grid grid-cols-3 gap-3 text-sm text-muted-foreground rounded-md border bg-muted/40 px-3 py-2">
          <div>
            <p className="text-xs">Qty ppto.</p>
            <p className="font-mono font-medium text-foreground">
              {formatQtyFromString(selected.budgetQty ?? "0")}
            </p>
          </div>
          <div>
            <p className="text-xs">Qty previa</p>
            <p className="font-mono font-medium text-foreground">
              {formatQtyFromString(selected.previousQty ?? "0")}
            </p>
          </div>
          <div>
            <p className="text-xs">Saldo pend.</p>
            <p className="font-mono font-medium text-foreground">
              {formatQtyFromString(selected.remainingQty ?? "0")}
            </p>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Cantidad económica certificada</Label>
          <DecimalInput
            value={currentQty}
            onValueChange={setCurrentQty}
            placeholder="0,00"
          />
          <p className="text-[11px] text-muted-foreground">
            Precargado con el saldo pendiente (editable).
          </p>
        </div>
        <div className="space-y-1.5">
          <Label>% Físico (período)</Label>
          <DecimalInput
            value={physicalPct}
            onValueChange={setPhysicalPct}
            placeholder="0"
          />
          <p className="text-[11px] text-muted-foreground">
            Independiente de la qty económica (BR-CERT-003).
          </p>
        </div>
      </div>

      {isOver ? (
        <div className="rounded-md border border-amber-400 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
          Aviso: el acumulado ({formatQtyFromString(previewCumulative)}) supera el presupuesto ({formatQtyFromString(budgetQty)}).
        </div>
      ) : null}

      <div className="space-y-1.5">
        <Label>Notas</Label>
        <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onDone} disabled={isPending}>
          Cancelar
        </Button>
        <Button type="submit" size="sm" disabled={isPending || !wbsNodeId}>
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
  const previewCumulative = (() => {
    try {
      return roundQty(addDecimal(line.previousQty, currentQty || "0"));
    } catch {
      return line.previousQty;
    }
  })();
  const isOver = compareQty(previewCumulative, line.budgetQty) > 0;
  // Ceiling for this period = ppto − previa (not post-line remainingQty).
  const periodRemaining = (() => {
    try {
      const rem = roundQty(addDecimal(line.budgetQty, multiplyDecimal(line.previousQty, -1)));
      return rem.startsWith("-") ? "0.0000" : rem;
    } catch {
      return "0.0000";
    }
  })();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await onSubmit({
        physicalPct: numberFromCanonicalDecimal(physicalPct),
        currentQty: numberFromCanonicalDecimal(currentQty),
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

      <div className="grid grid-cols-3 gap-3 text-sm text-muted-foreground">
        <div>
          <p className="text-xs">Qty presupuestada</p>
          <p className="font-mono font-medium text-foreground">{formatQtyFromString(line.budgetQty)}</p>
        </div>
        <div>
          <p className="text-xs">Qty certificada previa</p>
          <p className="font-mono font-medium text-foreground">{formatQtyFromString(line.previousQty)}</p>
        </div>
        <div>
          <p className="text-xs">Saldo pend.</p>
          <p className="font-mono font-medium text-foreground">{formatQtyFromString(periodRemaining)}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Cantidad económica certificada</Label>
          <DecimalInput
            value={currentQty}
            onValueChange={setCurrentQty}
            placeholder="0,00"
          />
        </div>
        <div className="space-y-1.5">
          <Label>% Físico</Label>
          <DecimalInput
            value={physicalPct}
            onValueChange={setPhysicalPct}
            placeholder="0"
          />
        </div>
      </div>

      {isOver && (
        <div className="rounded-md border border-amber-400 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
          Aviso: la cantidad acumulada ({formatQtyFromString(previewCumulative)}) supera el presupuesto ({formatQtyFromString(line.budgetQty)}).
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
