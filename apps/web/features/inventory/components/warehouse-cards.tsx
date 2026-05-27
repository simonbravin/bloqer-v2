import Link from "next/link";
import { ListEmptyState } from "@/components/ui/list-empty-state";
import type { WarehouseView } from "@bloqer/services";
import { WarehouseStatusBadge } from "./warehouse-status-badge";

const TYPE_LABELS: Record<string, string> = {
  CENTRAL: "Central",
  PROJECT: "Proyecto",
  TEMPORARY: "Temporal",
  OTHER: "Otro",
};

export function WarehouseCards({ warehouses }: { warehouses: WarehouseView[] }) {
  if (warehouses.length === 0) {
    return <ListEmptyState message="No hay depósitos registrados." />;
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {warehouses.map((w) => (
        <Link
          key={w.id}
          href={`/inventario/depositos/${w.id}`}
          className="flex flex-col rounded-lg border bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
        >
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold">{w.name}</h3>
            <WarehouseStatusBadge status={w.status} />
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{TYPE_LABELS[w.type] ?? w.type}</p>
          {w.address ? <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{w.address}</p> : null}
        </Link>
      ))}
    </div>
  );
}
