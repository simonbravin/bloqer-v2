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
import { createPurchaseOrderAction } from "@/app/(app)/proyectos/[id]/ordenes-compra/actions";

export type SupplierOption = { id: string; label: string };

interface Props {
  projectId: string;
  suppliers: SupplierOption[];
  wbsOptions: WbsOption[];
  productOptions?: ProductOption[];
  allowEmergencyDirectPo?: boolean;
  variant?: "card" | "plain";
  onCancel?: () => void;
  onSuccess?: () => void;
}

const DEFAULT_LINE: PurchaseOrderLine = {
  wbsNodeId: null,
  productId: null,
  description: "",
  unit: "",
  quantity: "1",
  unitPrice: "",
  taxRate: "21",
};

export function PurchaseOrderForm({
  projectId,
  suppliers,
  wbsOptions,
  productOptions = [],
  allowEmergencyDirectPo = false,
  variant = "card",
  onCancel,
  onSuccess,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [supplierContactId, setSupplierContactId] = useState("");
  const [lines, setLines] = useState<PurchaseOrderLine[]>([{ ...DEFAULT_LINE }]);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!supplierContactId) {
      setError("Debe seleccionar un proveedor");
      return;
    }
    if (lines.some((l) => !l.wbsNodeId)) {
      setError("Cada línea debe tener un ítem WBS");
      return;
    }
    if (lines.some((l) => !l.description.trim() || !l.quantity || !l.unitPrice)) {
      setError("Completar descripción, cantidad y precio en todas las líneas");
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
    <div className={variant === "card" ? "rounded-lg border bg-card p-6" : undefined}>
      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <p className="rounded bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 space-y-1">
            <Label htmlFor="po-supplier">Proveedor</Label>
            {suppliers.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No hay proveedores activos. Cree un contacto con rol Proveedor primero.
              </p>
            ) : (
              <SearchableCombobox
                id="po-supplier"
                options={toSearchableOptions(suppliers)}
                value={supplierContactId}
                onValueChange={setSupplierContactId}
                placeholder="Seleccionar proveedor…"
                searchPlaceholder="Buscar proveedor…"
                emptyText="Ningún proveedor coincide."
              />
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

        <PurchaseOrderLinesEditor
          lines={lines}
          onChange={setLines}
          wbsOptions={wbsOptions}
          productOptions={productOptions}
          showVarianceJustification
        />

        <hr />

        {allowEmergencyDirectPo && (
          <div className="space-y-1">
            <Label htmlFor="emergencyReason">Motivo de emergencia (si supera umbral sin SC)</Label>
            <Textarea id="emergencyReason" name="emergencyReason" rows={2} />
            <p className="text-xs text-muted-foreground">
              Solo OWNER/ADMIN pueden autorizar compra de emergencia sobre el umbral.
            </p>
          </div>
        )}

        <div className="space-y-1">
          <Label htmlFor="notes">Notas (opcional)</Label>
          <Textarea id="notes" name="notes" rows={2} />
        </div>

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel ?? (() => router.back())}
          >
            Cancelar
          </Button>
          <Button type="submit" disabled={isPending || suppliers.length === 0}>
            {isPending ? "Guardando…" : "Crear orden de compra"}
          </Button>
        </div>
      </form>
    </div>
  );
}
