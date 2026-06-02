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
          const result = await createProcurementQuoteAction(projectId, {
            purchaseRequestId,
            supplierContactId: supplierId,
            currency: "ARS",
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

      {lines.map((line) => (
        <div key={line.id} className="grid grid-cols-3 gap-2 items-end text-sm">
          <div className="col-span-2">
            <p className="font-medium">{line.description}</p>
            <p className="text-muted-foreground">
              {line.quantity} {line.unit}
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
