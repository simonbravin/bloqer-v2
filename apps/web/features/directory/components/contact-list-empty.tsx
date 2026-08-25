"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ListEmptyState } from "@/components/ui/list-empty-state";

/** Empty Directorio — distinguish truly empty tenant vs filtered miss ([D-090]). */
export function ContactListEmpty({ hasActiveFilters }: { hasActiveFilters: boolean }) {
  if (hasActiveFilters) {
    return <ListEmptyState message="No se encontraron contactos con los filtros aplicados." />;
  }

  return (
    <ListEmptyState
      title="Todavía no hay contactos"
      description="Cargá un proveedor, cliente o empleado en el Directorio para operar compras, obras y pagos."
      action={
        <div className="flex flex-wrap justify-center gap-2">
          <Button asChild size="sm">
            <Link href="/directorio/nuevo?role=SUPPLIER">+ Nuevo proveedor</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/ayuda/cargar-un-proveedor">Cómo se carga un proveedor</Link>
          </Button>
        </div>
      }
    />
  );
}
