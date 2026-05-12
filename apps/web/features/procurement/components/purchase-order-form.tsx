"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { PurchaseOrderLinesEditor } from "./purchase-order-lines-editor";
import type { PurchaseOrderLine, WbsOption, ProductOption } from "./purchase-order-lines-editor";
import { createPurchaseOrderAction } from "@/app/(app)/proyectos/[id]/ordenes-compra/actions";

export type SupplierOption = { id: string; label: string };

interface Props {
  projectId: string;
  suppliers: SupplierOption[];
  wbsOptions: WbsOption[];
  productOptions?: ProductOption[];
}

const DEFAULT_LINE: PurchaseOrderLine = {
  wbsNodeId: null, productId: null, description: "", unit: "", quantity: "1", unitPrice: "", taxRate: "21",
};

export function PurchaseOrderForm({ projectId, suppliers, wbsOptions, productOptions = [] }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [supplierContactId, setSupplierContactId] = useState("");
  const [lines, setLines] = useState<PurchaseOrderLine[]>([{ ...DEFAULT_LINE }]);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!supplierContactId) { setError("Debe seleccionar un proveedor"); return; }
    if (lines.some((l) => !l.description.trim() || !l.quantity || !l.unitPrice)) {
      setError("Completar descripción, cantidad y precio en todas las líneas");
      return;
    }
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await createPurchaseOrderAction(projectId, {
        projectId,
        supplierContactId,
        issueDate:            fd.get("issueDate") as string,
        expectedDeliveryDate: (fd.get("expectedDeliveryDate") as string) || null,
        currency:             "ARS",
        notes:                (fd.get("notes") as string) || null,
        internalNotes:        null,
        lines:                lines.map((l, i) => ({ ...l, sortOrder: i })),
      });
      if ("error" in res) {
        setError(res.error);
      } else {
        router.push(`/proyectos/${projectId}/ordenes-compra/${res.id}`);
      }
    });
  }

  return (
    <div className="rounded-lg border bg-card p-6">
      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <p className="rounded bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 space-y-1">
            <Label>Proveedor</Label>
            {suppliers.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No hay proveedores activos. Cree un contacto con rol Proveedor primero.
              </p>
            ) : (
              <Select onValueChange={setSupplierContactId} value={supplierContactId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar proveedor…" />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="issueDate">Fecha de emisión</Label>
            <Input id="issueDate" name="issueDate" type="date" required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="expectedDeliveryDate">Fecha de entrega esperada</Label>
            <Input id="expectedDeliveryDate" name="expectedDeliveryDate" type="date" />
          </div>
        </div>

        <hr />

        <PurchaseOrderLinesEditor lines={lines} onChange={setLines} wbsOptions={wbsOptions} productOptions={productOptions} />

        <hr />

        <div className="space-y-1">
          <Label htmlFor="notes">Notas (opcional)</Label>
          <Textarea id="notes" name="notes" rows={2} />
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => router.back()}>Cancelar</Button>
          <Button type="submit" disabled={isPending || suppliers.length === 0}>
            {isPending ? "Guardando…" : "Crear orden de compra"}
          </Button>
        </div>
      </form>
    </div>
  );
}
