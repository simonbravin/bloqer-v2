"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SupplierOption } from "./purchase-order-form";
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
              unitPrice: fd.get(`unitPrice_${line.id}`)?.toString() ?? "0",
              taxRate: "21",
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
        <Select value={supplierId} onValueChange={setSupplierId}>
          <SelectTrigger>
            <SelectValue placeholder="Elegir proveedor" />
          </SelectTrigger>
          <SelectContent>
            {suppliers.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
        <div key={line.id} className="grid grid-cols-4 gap-2 items-end text-sm">
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
            <Input
              id={`unitPrice_${line.id}`}
              name={`unitPrice_${line.id}`}
              defaultValue="0"
              required
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
