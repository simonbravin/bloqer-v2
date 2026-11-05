"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useInventoryAction } from "../lib/use-inventory-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { UnitSelect } from "@/features/budgets/components/unit-select";
import { createProductAction, updateProductAction } from "@/app/(app)/inventario/productos/actions";

interface Props {
  companyId?: string;
  productId?: string;
  canEditUnit?: boolean;
  initialValues?: {
    sku: string;
    name: string;
    unit: string;
    category: string | null;
    description: string | null;
    notes: string | null;
  };
}

export function ProductForm({ companyId, productId, canEditUnit, initialValues }: Props) {
  const router = useRouter();
  const { pending: isPending, run } = useInventoryAction();
  const [error, setError] = useState<string | null>(null);
  const [unit, setUnit] = useState(initialValues?.unit ?? "un");
  const unitLocked = Boolean(productId) && canEditUnit !== true;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    run(async () => {
      setError(null);
      const fields = {
        name: fd.get("name") as string,
        description: (fd.get("description") as string) || null,
        ...(unitLocked ? {} : { unit: unit || "un" }),
        category: (fd.get("category") as string) || null,
        notes: (fd.get("notes") as string) || null,
      };
      const res = productId
        ? await updateProductAction(productId, fields)
        : await createProductAction({
            ...fields,
            unit: unit || "un",
            companyId: companyId ?? null,
            sku: fd.get("sku") as string,
          });
      if ("error" in res) {
        setError(res.error ?? null);
      } else {
        const id = productId ?? ("id" in res ? res.id : null);
        if (id) router.push(`/inventario/productos/${id}`);
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <fieldset disabled={isPending} className="min-w-0 space-y-4">
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="sku">SKU</Label>
            <Input
              id="sku"
              name="sku"
              required
              placeholder="MAT-001"
              defaultValue={initialValues?.sku}
              readOnly={Boolean(productId)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="unit">Unidad</Label>
            <UnitSelect id="unit" value={unit} onChange={setUnit} disabled={isPending || unitLocked} />
            {unitLocked && (
              <p className="text-sm text-muted-foreground">
                La unidad queda fija desde el primer uso. Para operar con otra unidad, creá otro producto.
              </p>
            )}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="name">Nombre</Label>
          <Input
            id="name"
            name="name"
            required
            placeholder="Nombre del producto"
            defaultValue={initialValues?.name}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="category">Categoría</Label>
          <Input
            id="category"
            name="category"
            placeholder="Materiales, Equipos…"
            defaultValue={initialValues?.category ?? ""}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="description">Descripción</Label>
          <Textarea
            id="description"
            name="description"
            rows={2}
            defaultValue={initialValues?.description ?? ""}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="notes">Notas internas</Label>
          <Textarea id="notes" name="notes" rows={2} defaultValue={initialValues?.notes ?? ""} />
        </div>

        <div className="flex gap-2 pt-2">
          <Button type="submit" disabled={isPending}>
            {isPending ? "Guardando…" : productId ? "Guardar cambios" : "Crear producto"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => router.back()} disabled={isPending}>
            Cancelar
          </Button>
        </div>
      </fieldset>
    </form>
  );
}
