"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  SearchableCombobox,
  wbsToSearchableOptions,
} from "@/components/ui/searchable-combobox";
import { formatDecimalAr } from "@/lib/format-money";
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
  const [wbsNodeId, setWbsNodeId] = useState<string>("");

  const wbsComboboxOptions = useMemo(() => wbsToSearchableOptions(wbsOptions), [wbsOptions]);
  const selectedWbs = wbsOptions.find((w) => w.id === wbsNodeId);

  return (
    <div className="rounded-lg border bg-card p-6">
      <form
        className="space-y-5"
        action={(fd) => {
          startTransition(async () => {
            setError(null);
            if (!wbsNodeId) {
              setError("Seleccioná un ítem WBS");
              return;
            }
            const result = await createPurchaseRequestAction(projectId, {
              projectId,
              neededByDate: fd.get("neededByDate")?.toString() || null,
              notes: fd.get("notes")?.toString() || null,
              lines: [
                {
                  wbsNodeId,
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
        {error && (
          <p className="rounded bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
        )}

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

        <div className="space-y-2">
          <Label>Ítem WBS (obligatorio)</Label>
          {wbsOptions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No hay ítems WBS en presupuestos aprobados/cerrados.
            </p>
          ) : (
            <SearchableCombobox
              popoverWidth="wide"
              options={wbsComboboxOptions}
              value={wbsNodeId}
              onValueChange={setWbsNodeId}
              placeholder="Elegir partida…"
              searchPlaceholder="Buscar partida…"
            />
          )}
          {selectedWbs?.budgetUnitCost != null && (
            <p className="text-xs text-muted-foreground">
              Costo ref. materiales: {formatDecimalAr(Number(selectedWbs.budgetUnitCost))}
              {selectedWbs.availableSaldo != null
                ? ` · Saldo disponible: ${formatDecimalAr(Number(selectedWbs.availableSaldo))}`
                : ""}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="neededByDate">Fecha necesaria</Label>
          <Input id="neededByDate" name="neededByDate" type="date" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="notes">Notas</Label>
          <Textarea id="notes" name="notes" rows={3} />
        </div>

        <Button type="submit" disabled={pending || wbsOptions.length === 0}>
          {pending ? "Guardando…" : "Crear solicitud"}
        </Button>
      </form>
    </div>
  );
}
