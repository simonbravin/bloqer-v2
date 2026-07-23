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
  initialLine?: {
    wbsNodeId?: string;
    description?: string;
    quantity?: string;
    productId?: string;
  };
  /** When true, show banner that fields came from materiales board. */
  prefilledFromMaterials?: boolean;
  variant?: "card" | "plain";
  onCancel?: () => void;
  onSuccess?: () => void;
}

export function PurchaseRequestForm({
  projectId,
  wbsOptions,
  initialLine,
  prefilledFromMaterials = false,
  variant = "card",
  onCancel,
  onSuccess,
}: PurchaseRequestFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [wbsNodeId, setWbsNodeId] = useState<string>(initialLine?.wbsNodeId ?? "");

  const wbsComboboxOptions = useMemo(() => wbsToSearchableOptions(wbsOptions), [wbsOptions]);
  const selectedWbs = wbsOptions.find((w) => w.id === wbsNodeId);

  return (
    <div className={variant === "card" ? "rounded-lg border bg-card p-6" : undefined}>
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
                  productId: initialLine?.productId ?? null,
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
            onSuccess?.();
            router.push(`/proyectos/${projectId}/solicitudes-compra/${result.id}`);
            router.refresh();
          });
        }}
      >
        {prefilledFromMaterials ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
            Prefill desde Materiales (faltante). Revisá cantidad y partida antes de crear.
          </p>
        ) : null}

        {error ? (
          <p className="rounded bg-destructive/10 p-3 text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="description">Descripción</Label>
          <Input
            id="description"
            name="description"
            required
            defaultValue={initialLine?.description ?? ""}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="quantity">Cantidad</Label>
            <Input
              id="quantity"
              name="quantity"
              inputMode="decimal"
              defaultValue={initialLine?.quantity ?? "1"}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="unit">Unidad</Label>
            <Input
              key={selectedWbs?.budgetUnit ?? "u"}
              id="unit"
              name="unit"
              defaultValue={selectedWbs?.budgetUnit ?? "u"}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="pr-wbs">Ítem WBS (obligatorio)</Label>
          {wbsOptions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No hay ítems WBS en presupuestos aprobados/cerrados.
            </p>
          ) : (
            <SearchableCombobox
              id="pr-wbs"
              popoverWidth="wide"
              options={wbsComboboxOptions}
              value={wbsNodeId}
              onValueChange={setWbsNodeId}
              placeholder="Elegir partida…"
              searchPlaceholder="Buscar partida…"
            />
          )}
          {selectedWbs?.budgetUnitCost != null ? (
            <p className="text-xs text-muted-foreground">
              Costo ref. materiales: {formatDecimalAr(Number(selectedWbs.budgetUnitCost))}
              {selectedWbs?.availableSaldo != null
                ? ` · Saldo disponible: ${formatDecimalAr(Number(selectedWbs.availableSaldo))}`
                : ""}
            </p>
          ) : null}
          {selectedWbs?.wouldExceedBudget ? (
            <p className="text-xs text-destructive">
              Este ítem ya está cerca o por encima del saldo disponible.
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="neededByDate">Fecha necesaria</Label>
          <Input id="neededByDate" name="neededByDate" type="date" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="notes">Notas</Label>
          <Textarea id="notes" name="notes" rows={3} />
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel ?? (() => router.back())}
          >
            Cancelar
          </Button>
          <Button type="submit" disabled={pending || wbsOptions.length === 0}>
            {pending ? "Guardando…" : "Crear solicitud"}
          </Button>
        </div>
      </form>
    </div>
  );
}
