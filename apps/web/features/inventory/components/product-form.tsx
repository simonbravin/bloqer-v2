"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createProductAction } from "@/app/(app)/inventario/productos/actions";

interface Props {
  companyId?: string;
}

export function ProductForm({ companyId }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await createProductAction({
        companyId:   companyId ?? null,
        sku:         fd.get("sku") as string,
        name:        fd.get("name") as string,
        description: (fd.get("description") as string) || null,
        unit:        (fd.get("unit") as string) || "",
        category:    (fd.get("category") as string) || null,
        notes:       (fd.get("notes") as string) || null,
      });
      if ("error" in res) {
        setError(res.error ?? null);
      } else {
        router.push(`/inventario/productos/${res.id}`);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="sku">SKU</Label>
          <Input id="sku" name="sku" required placeholder="MAT-001" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="unit">Unidad</Label>
          <Input id="unit" name="unit" placeholder="kg, m, un" />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="name">Nombre</Label>
        <Input id="name" name="name" required placeholder="Nombre del producto" />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="category">Categoría</Label>
        <Input id="category" name="category" placeholder="Materiales, Equipos…" />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description">Descripción</Label>
        <Textarea id="description" name="description" rows={2} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="notes">Notas internas</Label>
        <Textarea id="notes" name="notes" rows={2} />
      </div>

      <div className="flex gap-2 pt-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Guardando…" : "Crear producto"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.back()} disabled={isPending}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
