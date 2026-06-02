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
import {
  SearchableCombobox,
  SEARCHABLE_NONE,
  productsToSearchableOptions,
  withNoneOption,
  wbsToSearchableOptions,
} from "@/components/ui/searchable-combobox";
import { createStockConsumptionAction } from "@/app/(app)/proyectos/[id]/consumos/actions";

export type ProductOption   = { id: string; name: string; sku: string; unit: string };
export type WarehouseOption = { id: string; name: string };
export type WbsOption       = { id: string; code: string; name: string };

interface Props {
  projectId:  string;
  products:   ProductOption[];
  warehouses: WarehouseOption[];
  wbsOptions: WbsOption[];
}

export function ConsumptionForm({ projectId, products, warehouses, wbsOptions }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [productId, setProductId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [wbsNodeId, setWbsNodeId] = useState<string>(SEARCHABLE_NONE);

  const productOptions = useMemo(() => productsToSearchableOptions(products), [products]);
  const wbsComboboxOptions = useMemo(
    () => withNoneOption(wbsToSearchableOptions(wbsOptions), { label: "Sin asignación" }),
    [wbsOptions],
  );

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!productId)   { setError("Seleccione un producto"); return; }
    if (!warehouseId) { setError("Seleccione un depósito"); return; }
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
      });
      if ("error" in res) {
        setError(res.error ?? null);
      } else {
        router.push(`/proyectos/${projectId}/inventario`);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="space-y-1.5">
        <Label>Producto</Label>
        <SearchableCombobox
          popoverWidth="wide"
          options={productOptions}
          value={productId}
          onValueChange={setProductId}
          placeholder="Seleccionar producto…"
          searchPlaceholder="Buscar por SKU o nombre…"
        />
      </div>

      <div className="space-y-1.5">
        <Label>Depósito</Label>
        <Select value={warehouseId} onValueChange={setWarehouseId}>
          <SelectTrigger>
            <SelectValue placeholder="Seleccionar depósito…" />
          </SelectTrigger>
          <SelectContent>
            {warehouses.map((w) => (
              <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="quantity">Cantidad</Label>
          <Input id="quantity" name="quantity" required placeholder="0" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="movementDate">Fecha</Label>
          <Input
            id="movementDate"
            name="movementDate"
            type="date"
            required
            defaultValue={new Date().toISOString().slice(0, 10)}
          />
        </div>
      </div>

      {wbsOptions.length > 0 && (
        <div className="space-y-1.5">
          <Label>Partida WBS (opcional)</Label>
          <SearchableCombobox
            popoverWidth="wide"
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

      <div className="flex gap-2 pt-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Guardando…" : "Registrar consumo"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.back()} disabled={isPending}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
