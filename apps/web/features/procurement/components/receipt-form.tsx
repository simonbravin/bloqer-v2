"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
import { createPurchaseReceiptAction } from "@/app/(app)/proyectos/[id]/ordenes-compra/actions";
import type { PurchaseOrderLineView } from "@bloqer/services";

export type WarehouseOption = { id: string; name: string };

interface ReceiptLine {
  purchaseOrderLineId: string;
  description: string;
  unit: string;
  remaining: string;
  quantityReceived: string;
}

interface Props {
  projectId: string;
  purchaseOrderId: string;
  purchaseOrderCode: string;
  poLines: PurchaseOrderLineView[];
  warehouseOptions?: WarehouseOption[];
}

export function ReceiptForm({ projectId, purchaseOrderId, purchaseOrderCode, poLines, warehouseOptions = [] }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [warehouseId, setWarehouseId] = useState<string>("__none__");

  const [lines, setLines] = useState<ReceiptLine[]>(
    poLines
      .filter((l) => parseFloat(l.remainingQuantity) > 0)
      .map((l) => ({
        purchaseOrderLineId: l.id,
        description:         l.description,
        unit:                l.unit,
        remaining:           l.remainingQuantity,
        quantityReceived:    l.remainingQuantity,
      })),
  );

  function updateQty(i: number, value: string) {
    setLines(lines.map((l, idx) => idx === i ? { ...l, quantityReceived: value } : l));
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const activeLines = lines.filter((l) => parseFloat(l.quantityReceived) > 0);
    if (activeLines.length === 0) {
      setError("Debe ingresar al menos una cantidad mayor a cero");
      return;
    }
    for (const l of activeLines) {
      const qty = parseFloat(l.quantityReceived);
      const rem = parseFloat(l.remaining);
      if (qty > rem) {
        setError(`La cantidad de "${l.description}" excede la cantidad pendiente (${rem})`);
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
        lines:        activeLines.map((l) => ({
          purchaseOrderLineId: l.purchaseOrderLineId,
          quantityReceived:    l.quantityReceived,
          notes:               null,
        })),
      });
      if ("error" in res) {
        setError(res.error);
      } else {
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
    <div className="rounded-lg border bg-card p-6">
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
          <Input id="receiptDate" name="receiptDate" type="date" required />
        </div>

        <TableScroll className="border-0">
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
                    <Input
                      value={line.quantityReceived}
                      onChange={(e) => updateQty(i, e.target.value)}
                      placeholder="0"
                      className="h-8 text-sm"
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableScroll>

        <div className="space-y-1">
          <Label htmlFor="notes">Notas (opcional)</Label>
          <Textarea id="notes" name="notes" rows={2} />
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => router.back()}>Cancelar</Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Guardando…" : "Registrar recepción"}
          </Button>
        </div>
      </form>
    </div>
  );
}
