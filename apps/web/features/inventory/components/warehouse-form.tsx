"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useInventoryAction } from "../lib/use-inventory-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SearchableCombobox } from "@/components/ui/searchable-combobox";
import { SEARCHABLE_NONE, toSearchableOptions, withNoneOption } from "@/lib/searchable-options";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createWarehouseAction,
  updateWarehouseAction,
} from "@/app/(app)/inventario/depositos/actions";

interface Props {
  companyId: string;
  projectId?: string;
  warehouseId?: string;
  projects?: { id: string; label: string }[];
  initialValues?: { name: string; type: string; address: string | null; notes: string | null };
}

const WAREHOUSE_TYPE_LABELS: Record<string, string> = {
  CENTRAL: "Central",
  PROJECT: "Proyecto",
  TEMPORARY: "Temporal",
  OTHER: "Otro",
};

export function WarehouseForm({
  companyId,
  projectId,
  warehouseId,
  initialValues,
  projects,
}: Props) {
  const router = useRouter();
  const { pending: isPending, run } = useInventoryAction();
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState(initialValues?.type ?? "CENTRAL");
  const [selectedProject, setSelectedProject] = useState(projectId ?? SEARCHABLE_NONE);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    run(async () => {
      setError(null);
      const fields = {
        name: fd.get("name") as string,
        type: type as "CENTRAL" | "PROJECT" | "TEMPORARY" | "OTHER",
        address: (fd.get("address") as string) || null,
        notes: (fd.get("notes") as string) || null,
      };
      const res = warehouseId
        ? await updateWarehouseAction(warehouseId, fields)
        : await createWarehouseAction({
            ...fields,
            companyId,
            projectId: selectedProject === SEARCHABLE_NONE ? null : selectedProject,
          });
      if ("error" in res) {
        setError(res.error ?? null);
      } else {
        const id = warehouseId ?? ("id" in res ? res.id : null);
        if (id) router.push(`/inventario/depositos/${id}`);
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

        <div className="space-y-1.5">
          <Label htmlFor="name">Nombre</Label>
          <Input
            id="name"
            name="name"
            required
            placeholder="Depósito Central"
            defaultValue={initialValues?.name}
          />
        </div>

        {!warehouseId && projects ? (
          <div className="space-y-1.5">
            <Label htmlFor="warehouse-project">Obra (opcional)</Label>
            <SearchableCombobox
              id="warehouse-project"
              value={selectedProject}
              onValueChange={setSelectedProject}
              options={withNoneOption(toSearchableOptions(projects), {
                label: "Sin obra vinculada",
              })}
              placeholder="Sin obra vinculada"
              searchPlaceholder="Buscar obra…"
              disabled={isPending}
            />
          </div>
        ) : null}

        <div className="space-y-1.5">
          <Label htmlFor="warehouse-type">Tipo</Label>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger id="warehouse-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(WAREHOUSE_TYPE_LABELS).map(([val, label]) => (
                <SelectItem key={val} value={val}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="address">Dirección</Label>
          <Input
            id="address"
            name="address"
            placeholder="Av. Ejemplo 1234, Buenos Aires"
            defaultValue={initialValues?.address ?? ""}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="notes">Notas</Label>
          <Textarea id="notes" name="notes" rows={2} defaultValue={initialValues?.notes ?? ""} />
        </div>

        <div className="flex gap-2 pt-2">
          <Button type="submit" disabled={isPending}>
            {isPending ? "Guardando…" : warehouseId ? "Guardar cambios" : "Crear depósito"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => router.back()} disabled={isPending}>
            Cancelar
          </Button>
        </div>
      </fieldset>
    </form>
  );
}
