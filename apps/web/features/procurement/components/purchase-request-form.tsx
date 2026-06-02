"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { WbsOption } from "./purchase-order-lines-editor";
import { createPurchaseRequestAction } from "@/app/(app)/proyectos/[id]/solicitudes-compra/actions";

interface PurchaseRequestFormProps {
  projectId: string;
  wbsOptions: WbsOption[];
}

export function PurchaseRequestForm({ projectId, wbsOptions }: PurchaseRequestFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const NONE_WBS = "__none__";
  const [wbsNodeId, setWbsNodeId] = useState<string>(NONE_WBS);

  return (
    <form
      className="space-y-4 max-w-xl"
      action={(fd) => {
        startTransition(async () => {
          setError(null);
          const result = await createPurchaseRequestAction(projectId, {
            projectId,
            neededByDate: fd.get("neededByDate")?.toString() || null,
            notes: fd.get("notes")?.toString() || null,
            lines: [
              {
                wbsNodeId: wbsNodeId === NONE_WBS ? null : wbsNodeId,
                lineType: "MATERIAL",
                description: fd.get("description")?.toString() ?? "",
                unit: fd.get("unit")?.toString() ?? "u",
                quantity: fd.get("quantity")?.toString() ?? "1",
                sortOrder: 0,
              },
            ],
          });
          if ("error" in result) {
            setError(result.error);
            return;
          }
          router.push(`/proyectos/${projectId}/solicitudes-compra/${result.id}`);
          router.refresh();
        });
      }}
    >
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="space-y-2">
        <Label htmlFor="description">Descripción</Label>
        <Input id="description" name="description" required />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="quantity">Cantidad</Label>
          <Input id="quantity" name="quantity" defaultValue="1" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="unit">Unidad</Label>
          <Input id="unit" name="unit" defaultValue="u" />
        </div>
      </div>

      {wbsOptions.length > 0 && (
        <div className="space-y-2">
          <Label>Ítem WBS (opcional)</Label>
          <Select value={wbsNodeId} onValueChange={setWbsNodeId}>
            <SelectTrigger>
              <SelectValue placeholder="Sin imputación WBS" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE_WBS}>Sin imputación</SelectItem>
              {wbsOptions.map((w) => (
                <SelectItem key={w.id} value={w.id}>
                  {w.code} — {w.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="neededByDate">Fecha necesaria</Label>
        <Input id="neededByDate" name="neededByDate" type="date" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Notas</Label>
        <Textarea id="notes" name="notes" rows={3} />
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? "Guardando…" : "Crear solicitud"}
      </Button>
    </form>
  );
}
