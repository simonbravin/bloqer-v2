"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toIsoDateInTimeZone } from "@bloqer/utils";
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
import { SearchableCombobox } from "@/components/ui/searchable-combobox";
import { toSearchableOptions } from "@/lib/searchable-options";
import { DecimalInput } from "@/components/ui/decimal-input";
import { formatQtyFromString } from "@/lib/format-money";
import { useIdempotencyKey } from "@/lib/use-idempotency-key";
import { useInventoryAction } from "@/features/inventory/lib/use-inventory-action";

interface Warehouse {
  id: string;
  name: string;
}
interface Product {
  id: string;
  name: string;
  unit: string;
}

interface Props {
  warehouses: Warehouse[];
  products: Product[];
  sourceStockBalance?: string;
  selectedSourceId?: string;
  selectedProductId?: string;
  action: (fd: FormData) => Promise<{ error?: string }>;
}

export function WarehouseTransferForm({
  warehouses,
  products,
  sourceStockBalance,
  selectedSourceId,
  selectedProductId,
  action,
}: Props) {
  const router = useRouter();
  const { pending, run } = useInventoryAction();
  const [error, setError] = useState<string | null>(null);
  const [productId, setProductId] = useState(selectedProductId ?? "");
  const [sourceWarehouseId, setSourceWarehouseId] = useState(selectedSourceId ?? "");
  const [destinationWarehouseId, setDestinationWarehouseId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const { idempotencyKey } = useIdempotencyKey();

  const productOptions = useMemo(
    () =>
      toSearchableOptions(
        products.map((p) => ({
          id: p.id,
          label: p.unit ? `${p.name} (${p.unit})` : p.name,
        })),
      ),
    [products],
  );

  const today = toIsoDateInTimeZone();

  function onWarehouseOrProductChange(key: "src" | "prod", value: string) {
    const params = new URLSearchParams(window.location.search);
    params.set("sourceWarehouseId", key === "src" ? value : sourceWarehouseId);
    params.set("productId", key === "prod" ? value : productId);
    router.replace(`?${params.toString()}`);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    run(async () => {
      setError(null);
      const result = await action(fd);
      if (result?.error) {
        setError(result.error);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-w-xl">
      <fieldset disabled={pending} className="min-w-0 space-y-5">
        <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
        <input type="hidden" name="sourceWarehouseId" value={sourceWarehouseId} />
        <input type="hidden" name="destinationWarehouseId" value={destinationWarehouseId} />
        {error ? (
          <p role="alert" className="rounded bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        {warehouses.length < 2 || products.length === 0 ? (
          <p role="status" className="text-sm text-muted-foreground">
            Necesitás un producto activo y dos depósitos activos habilitados para crear una
            transferencia.
          </p>
        ) : null}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="sourceWarehouseId">Depósito origen</Label>
            <Select
              value={sourceWarehouseId || undefined}
              onValueChange={(v) => {
                setSourceWarehouseId(v);
                if (destinationWarehouseId === v) setDestinationWarehouseId("");
                onWarehouseOrProductChange("src", v);
              }}
              required
            >
              <SelectTrigger id="sourceWarehouseId">
                <SelectValue placeholder="Seleccioná un depósito" />
              </SelectTrigger>
              <SelectContent>
                {warehouses.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="destinationWarehouseId">Depósito destino</Label>
            <Select
              value={destinationWarehouseId || undefined}
              onValueChange={setDestinationWarehouseId}
              required
            >
              <SelectTrigger id="destinationWarehouseId">
                <SelectValue placeholder="Seleccioná un depósito" />
              </SelectTrigger>
              <SelectContent>
                {warehouses
                  .filter((w) => w.id !== sourceWarehouseId)
                  .map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="productId">Producto</Label>
          <input type="hidden" name="productId" value={productId} />
          <SearchableCombobox
            popoverWidth="wide"
            id="productId"
            options={productOptions}
            value={productId}
            onValueChange={(v) => {
              setProductId(v);
              onWarehouseOrProductChange("prod", v);
            }}
            placeholder="Seleccioná un producto"
            searchPlaceholder="Buscar producto…"
          />
          {sourceStockBalance !== undefined &&
            selectedSourceId === sourceWarehouseId &&
            selectedProductId === productId && (
              <p className="text-xs text-muted-foreground">
                Stock disponible en origen:{" "}
                <span className="font-medium">{formatQtyFromString(sourceStockBalance)}</span>
              </p>
            )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="quantity">Cantidad</Label>
            <DecimalInput
              id="quantity"
              name="quantity"
              precision={4}
              value={quantity}
              onValueChange={setQuantity}
              placeholder="0,00"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="unitCost">Costo unitario informado (opcional)</Label>
            <DecimalInput
              id="unitCost"
              name="unitCost"
              precision={4}
              value={unitCost}
              onValueChange={setUnitCost}
              placeholder="—"
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          La moneda de este importe no se registra en la transferencia. Es un dato informado y no
          una valuación del stock.
        </p>

        <div className="space-y-1.5">
          <Label htmlFor="transferDate">Fecha de transferencia</Label>
          <Input id="transferDate" name="transferDate" type="date" defaultValue={today} required />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="notes">Notas</Label>
          <Textarea id="notes" name="notes" rows={2} placeholder="Observaciones opcionales" />
        </div>

        <div className="flex gap-2 pt-2">
          <Button
            type="submit"
            disabled={
              pending ||
              warehouses.length < 2 ||
              !sourceWarehouseId ||
              !destinationWarehouseId ||
              !productId
            }
          >
            {pending ? "Guardando…" : "Crear transferencia"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => router.back()} disabled={pending}>
            Cancelar
          </Button>
        </div>
      </fieldset>
    </form>
  );
}
