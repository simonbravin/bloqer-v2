"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableScroll } from "@/components/ui/table-scroll";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toIsoDateInTimeZone } from "@bloqer/utils";
import { createPurchaseReceiptAction } from "@/app/(app)/proyectos/[id]/ordenes-compra/actions";
import type { PurchaseOrderLineView } from "@bloqer/services";
import { DecimalInput } from "@/components/ui/decimal-input";
import { formatQtyFromString, isPositiveQty, compareQty } from "@/lib/format-money";
import { useIdempotencyKey } from "@/lib/use-idempotency-key";

function todayLocalInputDate(): string {
  return toIsoDateInTimeZone();
}

export type WarehouseOption = { id: string; name: string };

interface ReceiptLine {
  purchaseOrderLineId: string;
  description: string;
  unit: string;
  ordered: string;
  previouslyReceived: string;
  remaining: string;
  quantityReceived: string;
}

interface Props {
  projectId: string;
  purchaseOrderId: string;
  purchaseOrderCode: string;
  poLines: PurchaseOrderLineView[];
  warehouseOptions?: WarehouseOption[];
  extraSections?: React.ReactNode;
  onCreated?: (id: string) => Promise<{ navigate?: boolean; message?: string } | void>;
}

function ReceiptQtyInput({
  line,
  index,
  onChange,
}: {
  line: ReceiptLine;
  index: number;
  onChange: (index: number, value: string) => void;
}) {
  const inputId = `receipt-qty-${line.purchaseOrderLineId}`;
  return (
    <DecimalInput
      id={inputId}
      value={line.quantityReceived}
      onValueChange={(v) => onChange(index, v)}
      placeholder="0,00"
      className="h-11 min-h-11 text-base tabular-nums md:h-8 md:min-h-8 md:text-sm"
      aria-label={`Cantidad recibida de ${line.description}`}
    />
  );
}

export function ReceiptForm({
  projectId,
  purchaseOrderId,
  purchaseOrderCode,
  poLines,
  warehouseOptions = [],
  extraSections,
  onCreated,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [warehouseId, setWarehouseId] = useState<string>("__none__");
  const { idempotencyKey, rotateIdempotencyKey } = useIdempotencyKey();

  const [lines, setLines] = useState<ReceiptLine[]>(
    poLines
      .filter((l) => isPositiveQty(l.remainingQuantity))
      .map((l) => ({
        purchaseOrderLineId: l.id,
        description:         l.description,
        unit:                l.unit,
        ordered:             l.quantity,
        previouslyReceived:  l.receivedQuantity,
        remaining:           l.remainingQuantity,
        quantityReceived:    l.remainingQuantity,
      })),
  );

  function updateQty(i: number, value: string) {
    setLines(lines.map((l, idx) => idx === i ? { ...l, quantityReceived: value } : l));
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const activeLines = lines.filter((l) => isPositiveQty(l.quantityReceived));
    if (activeLines.length === 0) {
      setError("Debe ingresar al menos una cantidad mayor a cero");
      return;
    }
    for (const l of activeLines) {
      if (compareQty(l.quantityReceived, l.remaining) > 0) {
        setError(
          `La cantidad de "${l.description}" excede la cantidad pendiente (${formatQtyFromString(l.remaining)})`,
        );
        return;
      }
    }
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await createPurchaseReceiptAction(projectId, {
        purchaseOrderId,
        warehouseId:  warehouseId === "__none__" ? null : warehouseId,
        receiptDate:  fd.get("receiptDate") as string,
        notes:        (fd.get("notes") as string) || null,
        idempotencyKey,
        lines:        activeLines.map((l) => ({
          purchaseOrderLineId: l.purchaseOrderLineId,
          quantityReceived:    l.quantityReceived,
          notes:               null,
        })),
      });
      if ("error" in res) {
        setError(res.error);
      } else {
        rotateIdempotencyKey();
        let created: { navigate?: boolean; message?: string } | void = undefined;
        try {
          created = await onCreated?.(res.id);
        } catch {
          created = {
            navigate: false,
            message: "Recepción creada correctamente. Algún archivo no pudo subirse.",
          };
        }
        if (created?.message) {
          toast.warning(created.message);
        }
        if (created?.navigate === false) return;
        router.push(`/proyectos/${projectId}/recepciones/${res.id}`);
      }
    });
  }

  if (lines.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-6">
        <p className="text-sm text-muted-foreground">
          No hay cantidades pendientes de recepcionar en esta orden de compra.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card p-4 sm:p-6">
      <p className="text-sm text-muted-foreground mb-4">OC: {purchaseOrderCode}</p>
      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <p className="rounded bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
        )}

        {warehouseOptions.length > 0 && (
          <div className="space-y-1">
            <Label>Depósito destino (opcional)</Label>
            <Select value={warehouseId} onValueChange={setWarehouseId}>
              <SelectTrigger>
                <SelectValue placeholder="Sin depósito — no genera stock" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Sin depósito</SelectItem>
                {warehouseOptions.map((w) => (
                  <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Al seleccionar un depósito se generarán movimientos de stock para líneas con producto asociado.
            </p>
          </div>
        )}

        <div className="space-y-1">
          <Label htmlFor="receiptDate">Fecha de recepción</Label>
          <Input id="receiptDate" name="receiptDate" type="date" required defaultValue={todayLocalInputDate()} />
        </div>

        <div className="space-y-3 md:hidden">
          {lines.map((line, i) => (
            <div
              key={line.purchaseOrderLineId}
              className="space-y-3 rounded-lg border bg-background p-4"
            >
              <p className="font-medium leading-snug">{line.description}</p>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">Unidad</dt>
                  <dd>{line.unit || "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Pedida</dt>
                  <dd className="tabular-nums">{formatQtyFromString(line.ordered)}</dd>
                </div>
                {isPositiveQty(line.previouslyReceived) ? (
                  <div>
                    <dt className="text-xs text-muted-foreground">Recibida previa</dt>
                    <dd className="tabular-nums">{formatQtyFromString(line.previouslyReceived)}</dd>
                  </div>
                ) : null}
                <div>
                  <dt className="text-xs text-muted-foreground">Pendiente</dt>
                  <dd className="tabular-nums font-medium">{formatQtyFromString(line.remaining)}</dd>
                </div>
              </dl>
              <div className="space-y-1">
                <Label htmlFor={`receipt-qty-${line.purchaseOrderLineId}`} className="text-sm font-semibold">
                  Cantidad recibida
                </Label>
                <ReceiptQtyInput line={line} index={i} onChange={updateQty} />
              </div>
            </div>
          ))}
        </div>

        <div className="hidden md:block">
          <TableScroll>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40%]">Descripción</TableHead>
                  <TableHead className="w-[12%]">Unidad</TableHead>
                  <TableHead className="w-[20%]">Pendiente</TableHead>
                  <TableHead className="w-[28%]">Cantidad recibida</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((line, i) => (
                  <TableRow key={line.purchaseOrderLineId}>
                    <TableCell>{line.description}</TableCell>
                    <TableCell className="text-muted-foreground">{line.unit || "—"}</TableCell>
                    <TableCell className="tabular-nums">{line.remaining}</TableCell>
                    <TableCell>
                      <ReceiptQtyInput line={line} index={i} onChange={updateQty} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableScroll>
        </div>

        <div className="space-y-1">
          <Label htmlFor="notes">Notas (opcional)</Label>
          <Textarea id="notes" name="notes" rows={2} />
        </div>

        {extraSections}

        <div className="sticky bottom-0 z-20 -mx-1 flex flex-col-reverse gap-2 border-t bg-background/95 p-3 backdrop-blur sm:flex-row sm:justify-end md:static md:mx-0 md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
          <Button type="button" variant="outline" className="min-h-11 md:min-h-9" onClick={() => router.back()}>
            Cancelar
          </Button>
          <Button type="submit" className="min-h-11 md:min-h-9" disabled={isPending}>
            {isPending ? "Guardando…" : "Registrar recepción"}
          </Button>
        </div>
      </form>
    </div>
  );
}
