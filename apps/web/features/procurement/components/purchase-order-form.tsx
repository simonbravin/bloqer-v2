"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AutoGrowTextarea } from "@/components/ui/auto-grow-textarea";
import { SearchableCombobox } from "@/components/ui/searchable-combobox";
import { CONTACT_PICKER_SEARCH_PLACEHOLDER, toSearchableOptions } from "@/lib/searchable-options";
import {
  DEFAULT_PURCHASE_ORDER_LINE,
  PurchaseOrderLinesEditor,
  type PurchaseOrderLine,
  type ProductOption,
  type WbsOption,
} from "./purchase-order-lines-editor";
import type { VarianceSettings } from "@bloqer/services/purchase-variance-pure";
import { createPurchaseOrderAction } from "@/app/(app)/proyectos/[id]/ordenes-compra/actions";

export type SupplierOption = { id: string; label: string; searchValue?: string };

interface Props {
  projectId: string;
  suppliers: SupplierOption[];
  wbsOptions: WbsOption[];
  productOptions?: ProductOption[];
  /** Show emergency reason only when policy allows AND actor is OWNER/ADMIN. */
  allowEmergencyDirectPo?: boolean;
  varianceSettings?: VarianceSettings;
  variant?: "card" | "plain";
  onCancel?: () => void;
  onSuccess?: () => void;
}

export function PurchaseOrderForm({
  projectId,
  suppliers,
  wbsOptions,
  productOptions = [],
  allowEmergencyDirectPo = false,
  varianceSettings,
  variant = "card",
  onCancel,
  onSuccess,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const [supplierContactId, setSupplierContactId] = useState("");
  const [lines, setLines] = useState<PurchaseOrderLine[]>([{ ...DEFAULT_PURCHASE_ORDER_LINE }]);

  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [error]);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!supplierContactId) {
      setError("Debe seleccionar un proveedor");
      return;
    }
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
    const emergencyReason = (fd.get("emergencyReason") as string) || null;
    startTransition(async () => {
      const res = await createPurchaseOrderAction(projectId, {
        projectId,
        supplierContactId,
        issueDate: fd.get("issueDate") as string,
        expectedDeliveryDate: (fd.get("expectedDeliveryDate") as string) || null,
        currency: "ARS",
        notes: (fd.get("notes") as string) || null,
        internalNotes: null,
        emergencyReason,
        lines: lines.map((l, i) => ({
          ...l,
          wbsNodeId: l.wbsNodeId!,
          sortOrder: i,
        })),
      });
      if ("error" in res) {
        setError(res.error);
      } else {
        onSuccess?.();
        router.push(`/proyectos/${projectId}/ordenes-compra/${res.id}`);
      }
    });
  }

  return (
    <div className={variant === "card" ? "rounded-lg border bg-card p-4 sm:p-6" : undefined}>
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
            {suppliers.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No hay proveedores activos. Cree un contacto con rol Proveedor primero.
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
            <Input id="issueDate" name="issueDate" type="date" required className="min-h-11 md:min-h-9" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="expectedDeliveryDate">Fecha de entrega esperada</Label>
            <Input id="expectedDeliveryDate" name="expectedDeliveryDate" type="date" className="min-h-11 md:min-h-9" />
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
        />

        <hr />

        {allowEmergencyDirectPo && (
          <div className="space-y-1">
            <Label htmlFor="emergencyReason">Motivo de emergencia (si supera umbral sin SC)</Label>
            <AutoGrowTextarea id="emergencyReason" name="emergencyReason" />
            <p className="text-xs text-muted-foreground">
              Obligatorio para OC directa sobre el umbral de solicitud. Solo OWNER/ADMIN.
            </p>
          </div>
        )}

        <div className="space-y-1">
          <Label htmlFor="notes">Notas</Label>
          <AutoGrowTextarea id="notes" name="notes" />
        </div>

        <div className="sticky bottom-0 z-20 -mx-1 flex flex-col-reverse gap-2 border-t bg-background/95 p-3 backdrop-blur sm:flex-row sm:justify-end md:static md:mx-0 md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
          <Button
            type="button"
            variant="outline"
            className="min-h-11 md:min-h-9"
            onClick={onCancel ?? (() => router.back())}
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            className="min-h-11 md:min-h-9"
            disabled={isPending || suppliers.length === 0}
          >
            {isPending ? "Guardando…" : "Crear orden de compra"}
          </Button>
        </div>
      </form>
    </div>
  );
}
