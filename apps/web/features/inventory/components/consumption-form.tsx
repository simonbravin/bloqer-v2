"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { SearchableCombobox } from "@/components/ui/searchable-combobox";
import { DecimalInput } from "@/components/ui/decimal-input";
import { SEARCHABLE_NONE, productsToSearchableOptions, withNoneOption, wbsToSearchableOptions } from "@/lib/searchable-options";
import { toIsoDateInTimeZone } from "@bloqer/utils";
import { useIdempotencyKey } from "@/lib/use-idempotency-key";
import { createStockConsumptionAction } from "@/app/(app)/proyectos/[id]/consumos/actions";

export type ProductOption   = { id: string; name: string; sku: string; unit: string };
export type WarehouseOption = { id: string; name: string };
export type WbsOption       = { id: string; code: string; name: string };

/** Product calendar date as `YYYY-MM-DD` (avoids UTC off-by-one from toISOString). */
function todayLocalInputDate(): string {
  return toIsoDateInTimeZone();
}

interface Props {
  projectId:  string;
  products:   ProductOption[];
  warehouses: WarehouseOption[];
  wbsOptions: WbsOption[];
  variant?: "card" | "plain";
  onCancel?: () => void;
  onSuccess?: () => void;
}

export function ConsumptionForm({
  projectId,
  products,
  warehouses,
  wbsOptions,
  variant = "card",
  onCancel,
  onSuccess,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [productId, setProductId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [wbsNodeId, setWbsNodeId] = useState<string>(SEARCHABLE_NONE);
  const [quantity, setQuantity] = useState("");
  const { idempotencyKey, rotateIdempotencyKey } = useIdempotencyKey();

  const productOptions = useMemo(() => productsToSearchableOptions(products), [products]);
  const wbsComboboxOptions = useMemo(
    () => withNoneOption(wbsToSearchableOptions(wbsOptions), { label: "Sin asignación" }),
    [wbsOptions],
  );
  const selectedProduct = products.find((p) => p.id === productId);
  const catalogsReady = products.length > 0 && warehouses.length > 0;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!productId)   { setError("Seleccioná un producto"); return; }
    if (!warehouseId) { setError("Seleccioná un depósito"); return; }
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await createStockConsumptionAction(projectId, {
        projectId,
        warehouseId,
        productId,
        wbsNodeId:    wbsNodeId === SEARCHABLE_NONE ? null : wbsNodeId,
        quantity:     fd.get("quantity") as string,
        movementDate: fd.get("movementDate") as string,
        notes:        (fd.get("notes") as string) || null,
        idempotencyKey,
      });
      if ("error" in res) {
        setError(res.error ?? null);
        return;
      }
      rotateIdempotencyKey();
      // Close first, then land on clean list URL so `?create=1` cannot reopen the dialog after refresh.
      onSuccess?.();
      router.replace(`/proyectos/${projectId}/consumos`);
      router.refresh();
    });
  }

  return (
    <div className={variant === "card" ? "rounded-lg border bg-card p-6" : undefined}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <p className="rounded bg-destructive/10 p-3 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        {!catalogsReady ? (
          <p className="rounded border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            {products.length === 0 && warehouses.length === 0
              ? "Necesitás al menos un producto y un depósito activos para registrar un consumo."
              : products.length === 0
                ? "No hay productos activos. Creá uno en el catálogo de inventario primero."
                : "No hay depósitos activos. Creá uno antes de registrar consumos."}
          </p>
        ) : null}

        <div className="space-y-1.5">
          <Label>Producto</Label>
          {products.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin productos activos.</p>
          ) : (
            <SearchableCombobox
              popoverWidth="wide"
              className="min-h-11 h-11 md:h-10 md:min-h-10"
              options={productOptions}
              value={productId}
              onValueChange={setProductId}
              placeholder="Seleccionar producto…"
              searchPlaceholder="Buscar por SKU o nombre…"
            />
          )}
        </div>

        <div className="space-y-1.5">
          <Label>Depósito</Label>
          {warehouses.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin depósitos activos.</p>
          ) : (
            <Select value={warehouseId} onValueChange={setWarehouseId}>
              <SelectTrigger className="min-h-11 md:min-h-10">
                <SelectValue placeholder="Seleccionar depósito…" />
              </SelectTrigger>
              <SelectContent>
                {warehouses.map((w) => (
                  <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="quantity">
              Cantidad{selectedProduct?.unit ? ` (${selectedProduct.unit})` : ""}
            </Label>
            <DecimalInput
              id="quantity"
              name="quantity"
              required
              placeholder="0,00"
              className="min-h-11 md:min-h-10"
              value={quantity}
              onValueChange={setQuantity}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="movementDate">Fecha</Label>
            <Input
              id="movementDate"
              name="movementDate"
              type="date"
              required
              className="min-h-11 md:min-h-10"
              defaultValue={todayLocalInputDate()}
            />
          </div>
        </div>

        {wbsOptions.length > 0 && (
          <div className="space-y-1.5">
            <Label>Partida EDT (opcional)</Label>
            <SearchableCombobox
              popoverWidth="wide"
              className="min-h-11 h-11 md:h-10 md:min-h-10"
              options={wbsComboboxOptions}
              value={wbsNodeId}
              onValueChange={setWbsNodeId}
              placeholder="Sin asignación"
              searchPlaceholder="Buscar partida…"
            />
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="notes">Notas</Label>
          <Textarea id="notes" name="notes" rows={2} />
        </div>

        <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap justify-end gap-2 border-t bg-background/95 p-3 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
          <Button
            type="button"
            variant="outline"
            className="min-h-11 md:min-h-9"
            onClick={onCancel ?? (() => router.back())}
            disabled={isPending}
          >
            Cancelar
          </Button>
          <Button type="submit" className="min-h-11 md:min-h-9" disabled={isPending || !catalogsReady}>
            {isPending ? "Guardando…" : "Registrar consumo"}
          </Button>
        </div>
      </form>
    </div>
  );
}
