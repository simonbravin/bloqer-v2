"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DecimalInput } from "@/components/ui/decimal-input";
import { Label } from "@/components/ui/label";
import { SearchableCombobox } from "@/components/ui/searchable-combobox";
import type { SupplierOption } from "./purchase-order-form";
import { CONTACT_PICKER_SEARCH_PLACEHOLDER, toSearchableOptions } from "@/lib/searchable-options";
import {
  createProcurementQuoteAction,
  selectQuoteAndCreatePoAction,
} from "@/app/(app)/proyectos/[id]/solicitudes-compra/actions";

type PrLine = {
  id: string;
  description: string;
  unit: string;
  quantity: string;
  budgetUnitCostSnapshot?: string | null;
};

interface ProcurementQuoteFormProps {
  projectId: string;
  purchaseRequestId: string;
  suppliers: SupplierOption[];
  lines: PrLine[];
}

export function ProcurementQuoteForm({
  projectId,
  purchaseRequestId,
  suppliers,
  lines,
}: ProcurementQuoteFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [supplierId, setSupplierId] = useState("");
  const [lineMoney, setLineMoney] = useState<Record<string, { unitPrice: string; discountPct: string }>>(
    () => Object.fromEntries(lines.map((l) => [l.id, { unitPrice: "0", discountPct: "0" }])),
  );

  return (
    <form
      className="space-y-4 rounded-lg border p-4"
      action={(fd) => {
        startTransition(async () => {
          setError(null);
          if (!supplierId) {
            setError("Seleccioná un proveedor");
            return;
          }
          const leadRaw = fd.get("leadTimeDays")?.toString() ?? "";
          const leadTimeDays =
            leadRaw.trim() === "" ? null : Number.parseInt(leadRaw, 10);
          if (leadTimeDays != null && (Number.isNaN(leadTimeDays) || leadTimeDays < 0)) {
            setError("Plazo de entrega inválido");
            return;
          }
          const result = await createProcurementQuoteAction(projectId, {
            purchaseRequestId,
            supplierContactId: supplierId,
            currency: "ARS",
            validUntil: fd.get("validUntil")?.toString() || null,
            leadTimeDays,
            lines: lines.map((line, i) => ({
              purchaseRequestLineId: line.id,
              unitPrice: lineMoney[line.id]?.unitPrice ?? "0",
              taxRate: "21",
              discountPct: lineMoney[line.id]?.discountPct ?? "0",
              sortOrder: i,
            })),
          });
          if ("error" in result) {
            setError(result.error);
            return;
          }
          router.refresh();
        });
      }}
    >
      <p className="font-medium text-sm">Cargar cotización</p>
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="space-y-2">
        <Label>Proveedor</Label>
        {suppliers.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No hay proveedores activos. Cree un contacto con rol Proveedor primero.
          </p>
        ) : (
          <SearchableCombobox
            popoverWidth="wide"
            options={toSearchableOptions(suppliers)}
            value={supplierId}
            onValueChange={setSupplierId}
            placeholder="Elegir proveedor…"
            searchPlaceholder={CONTACT_PICKER_SEARCH_PLACEHOLDER}
            emptyText="Ningún proveedor coincide."
          />
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="leadTimeDays">Plazo de entrega (días)</Label>
          <Input id="leadTimeDays" name="leadTimeDays" type="number" min={0} placeholder="ej. 7" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="validUntil">Vigencia hasta</Label>
          <Input id="validUntil" name="validUntil" type="date" />
        </div>
      </div>

      {lines.map((line) => (
        <div key={line.id} className="grid grid-cols-2 sm:grid-cols-5 gap-2 items-end text-sm">
          <div className="col-span-2">
            <p className="font-medium">{line.description}</p>
            <p className="text-muted-foreground">
              {line.quantity} {line.unit}
              {line.budgetUnitCostSnapshot
                ? ` · ref. presup. ${line.budgetUnitCostSnapshot}`
                : ""}
            </p>
          </div>
          <div className="space-y-1">
            <Label htmlFor={`unitPrice_${line.id}`}>Precio unit.</Label>
            <DecimalInput
              id={`unitPrice_${line.id}`}
              value={lineMoney[line.id]?.unitPrice ?? "0"}
              onValueChange={(v) =>
                setLineMoney((prev) => ({
                  ...prev,
                  [line.id]: { unitPrice: v, discountPct: prev[line.id]?.discountPct ?? "0" },
                }))
              }
              placeholder="0,00"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`discountPct_${line.id}`}>Desc. %</Label>
            <DecimalInput
              id={`discountPct_${line.id}`}
              value={lineMoney[line.id]?.discountPct ?? "0"}
              onValueChange={(v) =>
                setLineMoney((prev) => ({
                  ...prev,
                  [line.id]: { unitPrice: prev[line.id]?.unitPrice ?? "0", discountPct: v },
                }))
              }
              placeholder="0"
              scale={4}
            />
          </div>
        </div>
      ))}

      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Guardando…" : "Registrar cotización"}
      </Button>
    </form>
  );
}

export function SelectQuoteButton({
  quoteId,
  projectId,
  purchaseRequestId,
}: {
  quoteId: string;
  projectId: string;
  purchaseRequestId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          const result = await selectQuoteAndCreatePoAction(
            quoteId,
            projectId,
            purchaseRequestId,
          );
          if ("error" in result) {
            toast.error(result.error);
            return;
          }
          router.push(`/proyectos/${projectId}/ordenes-compra/${result.purchaseOrderId}`);
          router.refresh();
        });
      }}
    >
      {pending ? "Generando OC…" : "Seleccionar → OC"}
    </Button>
  );
}
