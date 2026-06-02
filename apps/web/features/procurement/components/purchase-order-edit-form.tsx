"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SearchableCombobox, toSearchableOptions } from "@/components/ui/searchable-combobox";
import { PurchaseOrderLinesEditor } from "./purchase-order-lines-editor";
import type { PurchaseOrderLine, WbsOption, ProductOption } from "./purchase-order-lines-editor";
import { updatePurchaseOrderAction } from "@/app/(app)/proyectos/[id]/ordenes-compra/actions";
import type { PurchaseOrderView } from "@bloqer/services";
import type { SupplierOption } from "./purchase-order-form";

function toDateStr(d: Date | string): string {
  return d instanceof Date ? d.toISOString().split("T")[0] : String(d).split("T")[0];
}

interface Props {
  projectId: string;
  order: PurchaseOrderView;
  suppliers: SupplierOption[];
  wbsOptions: WbsOption[];
  productOptions?: ProductOption[];
}

export function PurchaseOrderEditForm({ projectId, order, suppliers, wbsOptions, productOptions = [] }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [supplierContactId, setSupplierContactId] = useState(order.supplierContactId);
  const [lines, setLines] = useState<PurchaseOrderLine[]>(
    order.lines.length > 0
      ? order.lines.map((l) => ({
          wbsNodeId:   l.wbsNodeId,
          productId:   l.productId ?? null,
          description: l.description,
          unit:        l.unit,
          quantity:    l.quantity,
          unitPrice:   l.unitPrice,
          taxRate:     l.taxRate,
          varianceJustification: l.varianceJustification,
        }))
      : [{ wbsNodeId: null, productId: null, description: "", unit: "", quantity: "1", unitPrice: "", taxRate: "21" }],
  );

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (lines.some((l) => !l.description.trim() || !l.quantity || !l.unitPrice)) {
      setError("Completar descripción, cantidad y precio en todas las líneas");
      return;
    }
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await updatePurchaseOrderAction(order.id, projectId, {
        supplierContactId,
        issueDate:            fd.get("issueDate") as string,
        expectedDeliveryDate: (fd.get("expectedDeliveryDate") as string) || null,
        notes:                (fd.get("notes") as string) || null,
        lines:                lines.map((l, i) => ({ ...l, sortOrder: i })),
      });
      if ("error" in res) {
        setError(res.error);
      } else {
        router.push(`/proyectos/${projectId}/ordenes-compra/${order.id}`);
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
            <SearchableCombobox
              options={toSearchableOptions(suppliers)}
              value={supplierContactId}
              onValueChange={setSupplierContactId}
              placeholder="Seleccionar proveedor…"
              searchPlaceholder="Buscar proveedor…"
              emptyText="Ningún proveedor coincide."
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="issueDate">Fecha de emisión</Label>
            <Input
              id="issueDate" name="issueDate" type="date" required
              defaultValue={toDateStr(order.issueDate)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="expectedDeliveryDate">Fecha de entrega esperada</Label>
            <Input
              id="expectedDeliveryDate" name="expectedDeliveryDate" type="date"
              defaultValue={order.expectedDeliveryDate ? toDateStr(order.expectedDeliveryDate) : ""}
            />
          </div>
        </div>

        <hr />

        <PurchaseOrderLinesEditor
          lines={lines}
          onChange={setLines}
          wbsOptions={wbsOptions}
          productOptions={productOptions}
          showVarianceJustification
        />

        <hr />

        <div className="space-y-1">
          <Label htmlFor="notes">Notas (opcional)</Label>
          <Textarea id="notes" name="notes" rows={2} defaultValue={order.notes ?? ""} />
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => router.back()}>Cancelar</Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Guardando…" : "Guardar cambios"}
          </Button>
        </div>
      </form>
    </div>
  );
}
