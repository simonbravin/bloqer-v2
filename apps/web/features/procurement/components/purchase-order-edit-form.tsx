"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SearchableCombobox } from "@/components/ui/searchable-combobox";
import { CONTACT_PICKER_SEARCH_PLACEHOLDER, toSearchableOptions } from "@/lib/searchable-options";
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
  /** Show emergency reason only for direct OC when policy + OWNER/ADMIN. */
  allowEmergencyDirectPo?: boolean;
}

export function PurchaseOrderEditForm({
  projectId,
  order,
  suppliers,
  wbsOptions,
  productOptions = [],
  allowEmergencyDirectPo = false,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [supplierContactId, setSupplierContactId] = useState(order.supplierContactId);
  const [lines, setLines] = useState<PurchaseOrderLine[]>(
    order.lines.length > 0
      ? order.lines.map((l) => ({
          wbsNodeId:   l.wbsNodeId,
          productId:   l.productId ?? null,
          costAnalysisLineId: l.costAnalysisLineId ?? null,
          description: l.description,
          unit:        l.unit,
          quantity:    l.quantity,
          unitPrice:   l.unitPrice,
          taxRate:     l.taxRate,
          discountPct: l.discountPct ?? "0",
          varianceJustification: l.varianceJustification,
        }))
      : [{ wbsNodeId: null, productId: null, costAnalysisLineId: null, description: "", unit: "", quantity: "1", unitPrice: "", taxRate: "21", discountPct: "0" }],
  );

  const showEmergency =
    allowEmergencyDirectPo && !order.purchaseRequestId;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (lines.some((l) => !l.wbsNodeId)) {
      setError("Cada línea debe tener un ítem EDT");
      return;
    }
    if (
      lines.some((l) => {
        const qty = Number(l.quantity);
        const price = Number(l.unitPrice);
        return (
          !l.description.trim() ||
          !Number.isFinite(qty) ||
          qty <= 0 ||
          l.unitPrice.trim() === "" ||
          !Number.isFinite(price) ||
          price < 0
        );
      })
    ) {
      setError("Completar descripción, cantidad (> 0) y precio (≥ 0) en todas las líneas");
      return;
    }
    const fd = new FormData(e.currentTarget);
    const emergencyReason = showEmergency
      ? ((fd.get("emergencyReason") as string) || null)
      : undefined;
    startTransition(async () => {
      const res = await updatePurchaseOrderAction(order.id, projectId, {
        supplierContactId,
        issueDate:            fd.get("issueDate") as string,
        expectedDeliveryDate: (fd.get("expectedDeliveryDate") as string) || null,
        notes:                (fd.get("notes") as string) || null,
        ...(emergencyReason !== undefined ? { emergencyReason } : {}),
        lines:                lines.map((l, i) => ({
          ...l,
          wbsNodeId: l.wbsNodeId!,
          sortOrder: i,
        })),
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
              popoverWidth="wide"
              options={toSearchableOptions(suppliers)}
              value={supplierContactId}
              onValueChange={setSupplierContactId}
              placeholder="Seleccionar proveedor…"
              searchPlaceholder={CONTACT_PICKER_SEARCH_PLACEHOLDER}
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

        {showEmergency && (
          <div className="space-y-1">
            <Label htmlFor="emergencyReason">Motivo de emergencia (si supera umbral sin SC)</Label>
            <Textarea
              id="emergencyReason"
              name="emergencyReason"
              rows={2}
              defaultValue={order.emergencyReason ?? ""}
            />
            <p className="text-xs text-muted-foreground">
              Obligatorio al enviar si el monto supera el umbral de solicitud.
            </p>
          </div>
        )}

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
