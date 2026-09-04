"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AutoGrowTextarea } from "@/components/ui/auto-grow-textarea";
import { PROCUREMENT_FORM_PAGE_CLASS } from "@/features/procurement/lib/procurement-form-layout";
import { SearchableCombobox } from "@/components/ui/searchable-combobox";
import { CONTACT_PICKER_SEARCH_PLACEHOLDER, toSearchableOptions } from "@/lib/searchable-options";
import {
  DEFAULT_PURCHASE_ORDER_LINE,
  PurchaseOrderLinesEditor,
  type PurchaseOrderLine,
  type ProductOption,
  type WbsOption,
} from "./purchase-order-lines-editor";
import { updatePurchaseOrderAction } from "@/app/(app)/proyectos/[id]/ordenes-compra/actions";
import type { PurchaseOrderView } from "@bloqer/services";
import type { VarianceSettings } from "@bloqer/services/purchase-variance-pure";
import type { SupplierOption } from "./purchase-order-form";
import { toDateInput } from "@/lib/date-input";

interface Props {
  projectId: string;
  order: PurchaseOrderView;
  suppliers: SupplierOption[];
  wbsOptions: WbsOption[];
  productOptions?: ProductOption[];
  /** Show emergency reason only for direct OC when policy + OWNER/ADMIN. */
  allowEmergencyDirectPo?: boolean;
  varianceSettings?: VarianceSettings;
}

export function PurchaseOrderEditForm({
  projectId,
  order,
  suppliers,
  wbsOptions,
  productOptions = [],
  allowEmergencyDirectPo = false,
  varianceSettings,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const [supplierContactId, setSupplierContactId] = useState(order.supplierContactId);
  const awardLocked = Boolean(order.purchaseRequestId);
  const [lines, setLines] = useState<PurchaseOrderLine[]>(
    order.lines.length > 0
      ? order.lines.map((l) => ({
          wbsNodeId:   l.wbsNodeId,
          productId:   l.productId ?? null,
          costAnalysisLineId: l.costAnalysisLineId ?? null,
          costType: (l.costType as PurchaseOrderLine["costType"]) ?? "MATERIAL",
          purchaseRequestLineId: l.purchaseRequestLineId ?? null,
          description: l.description,
          unit:        l.unit,
          quantity:    l.quantity,
          unitPrice:   l.unitPrice,
          taxRate:     l.taxRate,
          discountPct: l.discountPct ?? "0",
          sortOrder:   l.sortOrder,
          varianceJustification: l.varianceJustification,
        }))
      : [{ ...DEFAULT_PURCHASE_ORDER_LINE }],
  );

  const showEmergency =
    allowEmergencyDirectPo && !order.purchaseRequestId;

  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [error]);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
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
          purchaseRequestLineId: l.purchaseRequestLineId ?? null,
          sortOrder: l.sortOrder ?? i,
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
    <div className={`${PROCUREMENT_FORM_PAGE_CLASS} rounded-lg border bg-card p-4 sm:p-6`}>
      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <p
            ref={errorRef}
            className="rounded bg-destructive/10 p-3 text-sm text-destructive"
            role="alert"
          >
            {error}
          </p>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2 space-y-1">
            <Label htmlFor="po-supplier">Proveedor</Label>
            {awardLocked ? (
              <p className="min-h-11 rounded-md border bg-muted/40 px-3 py-2 text-sm md:min-h-9">
                {order.supplierName}
              </p>
            ) : (
              <SearchableCombobox
                id="po-supplier"
                popoverWidth="wide"
                options={toSearchableOptions(suppliers)}
                value={supplierContactId}
                onValueChange={setSupplierContactId}
                placeholder="Seleccionar proveedor…"
                searchPlaceholder={CONTACT_PICKER_SEARCH_PLACEHOLDER}
                emptyText="Ningún proveedor coincide."
              />
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="issueDate">Fecha de emisión</Label>
            <Input
              id="issueDate" name="issueDate" type="date" required
              defaultValue={toDateInput(order.issueDate)}
              className="min-h-11 md:min-h-9"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="expectedDeliveryDate">Fecha de entrega esperada</Label>
            <Input
              id="expectedDeliveryDate" name="expectedDeliveryDate" type="date"
              defaultValue={toDateInput(order.expectedDeliveryDate)}
              className="min-h-11 md:min-h-9"
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
          varianceSettings={varianceSettings}
          structureLocked={awardLocked}
        />

        <hr />

        {showEmergency && (
          <div className="space-y-1">
            <Label htmlFor="emergencyReason">Motivo de emergencia (si supera umbral sin SC)</Label>
            <AutoGrowTextarea
              id="emergencyReason"
              name="emergencyReason"
              defaultValue={order.emergencyReason ?? ""}
            />
            <p className="text-xs text-muted-foreground">
              Obligatorio al enviar si el monto supera el umbral de solicitud.
            </p>
          </div>
        )}

        <div className="space-y-1">
          <Label htmlFor="notes">Notas</Label>
          <AutoGrowTextarea id="notes" name="notes" defaultValue={order.notes ?? ""} />
        </div>

        <div className="sticky bottom-0 z-20 -mx-1 flex flex-col-reverse gap-2 border-t bg-background/95 p-3 backdrop-blur sm:flex-row sm:justify-end md:static md:mx-0 md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
          <Button type="button" variant="outline" className="min-h-11 md:min-h-9" onClick={() => router.back()}>
            Cancelar
          </Button>
          <Button type="submit" className="min-h-11 md:min-h-9" disabled={isPending}>
            {isPending ? "Guardando…" : "Guardar cambios"}
          </Button>
        </div>
      </form>
    </div>
  );
}
