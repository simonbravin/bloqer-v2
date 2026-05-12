"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { createWarehouseAction } from "@/app/(app)/inventario/depositos/actions";

interface Props {
  companyId: string;
  projectId?: string;
}

const WAREHOUSE_TYPE_LABELS: Record<string, string> = {
  CENTRAL:   "Central",
  PROJECT:   "Proyecto",
  TEMPORARY: "Temporal",
  OTHER:     "Otro",
};

export function WarehouseForm({ companyId, projectId }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState("CENTRAL");

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await createWarehouseAction({
        companyId,
        projectId: projectId ?? null,
        name:      fd.get("name") as string,
        type:      type as "CENTRAL" | "PROJECT" | "TEMPORARY" | "OTHER",
        address:   (fd.get("address") as string) || null,
        notes:     (fd.get("notes") as string) || null,
      });
      if ("error" in res) {
        setError(res.error ?? null);
      } else {
        router.push(`/inventario/depositos/${res.id}`);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="space-y-1.5">
        <Label htmlFor="name">Nombre</Label>
        <Input id="name" name="name" required placeholder="Depósito Central" />
      </div>

      <div className="space-y-1.5">
        <Label>Tipo</Label>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(WAREHOUSE_TYPE_LABELS).map(([val, label]) => (
              <SelectItem key={val} value={val}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="address">Dirección</Label>
        <Input id="address" name="address" placeholder="Av. Ejemplo 1234, Buenos Aires" />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="notes">Notas</Label>
        <Textarea id="notes" name="notes" rows={2} />
      </div>

      <div className="flex gap-2 pt-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Guardando…" : "Crear depósito"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.back()} disabled={isPending}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
