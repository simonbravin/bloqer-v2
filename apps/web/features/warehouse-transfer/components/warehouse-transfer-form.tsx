"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
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
import { SearchableCombobox, toSearchableOptions } from "@/components/ui/searchable-combobox";

interface Warehouse { id: string; name: string }
interface Product   { id: string; name: string; unit: string }

interface Props {
  warehouses:         Warehouse[];
  products:           Product[];
  sourceStockBalance?: string;
  selectedSourceId?:  string;
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
  const router     = useRouter();
  const [pending, startTransition] = useTransition();
  const [productId, setProductId] = useState(selectedProductId ?? "");

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

  const today = new Date().toISOString().slice(0, 10);

  function onWarehouseOrProductChange(key: "src" | "prod", value: string) {
    const params = new URLSearchParams(window.location.search);
    if (key === "src")  params.set("sourceWarehouseId", value);
    if (key === "prod") params.set("productId", value);
    router.replace(`?${params.toString()}`);
  }

  async function handleSubmit(fd: FormData) {
    startTransition(async () => {
      const result = await action(fd);
      if (result?.error) {
        alert(result.error);
      }
    });
  }

  return (
    <form action={handleSubmit} className="space-y-5 max-w-xl">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="sourceWarehouseId">Depósito origen</Label>
          <Select
            name="sourceWarehouseId"
            defaultValue={selectedSourceId ?? ""}
            onValueChange={(v) => onWarehouseOrProductChange("src", v)}
            required
          >
            <SelectTrigger id="sourceWarehouseId">
              <SelectValue placeholder="Seleccioná un depósito" />
            </SelectTrigger>
            <SelectContent>
              {warehouses.map((w) => (
                <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="destinationWarehouseId">Depósito destino</Label>
          <Select name="destinationWarehouseId" defaultValue="" required>
            <SelectTrigger id="destinationWarehouseId">
              <SelectValue placeholder="Seleccioná un depósito" />
            </SelectTrigger>
            <SelectContent>
              {warehouses.map((w) => (
                <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
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
        {sourceStockBalance !== undefined && (
          <p className="text-xs text-muted-foreground">
            Stock disponible en origen:{" "}
            <span className="font-medium">
              {parseFloat(sourceStockBalance).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
            </span>
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="quantity">Cantidad</Label>
          <Input
            id="quantity"
            name="quantity"
            type="number"
            min="0.0001"
            step="any"
            placeholder="0"
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="unitCost">Costo unitario (opcional)</Label>
          <Input
            id="unitCost"
            name="unitCost"
            type="number"
            min="0"
            step="any"
            placeholder="—"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="transferDate">Fecha de transferencia</Label>
        <Input
          id="transferDate"
          name="transferDate"
          type="date"
          defaultValue={today}
          required
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="notes">Notas</Label>
        <Textarea id="notes" name="notes" rows={2} placeholder="Observaciones opcionales" />
      </div>

      <div className="flex gap-2 pt-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : "Crear transferencia"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.back()}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
