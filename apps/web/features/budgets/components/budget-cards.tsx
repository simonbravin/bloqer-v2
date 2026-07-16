import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ListEmptyState } from "@/components/ui/list-empty-state";
import { BudgetStatusBadge } from "./budget-status-badge";
import type { BudgetListItem } from "./budget-list";

function fmt(value: string, currency: string) {
  return new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(parseFloat(value)) + " " + currency;
}

export function BudgetCards({
  budgets,
  projectId,
}: {
  budgets: BudgetListItem[];
  projectId: string;
}) {
  if (budgets.length === 0) {
    return (
      <ListEmptyState
        title="Sin presupuestos"
        description="Creá el primer presupuesto del proyecto. Un presupuesto adicional puede usarse como adenda operativa (sin vínculo automático)."
        action={
          <Button asChild size="sm">
            <Link href={`/proyectos/${projectId}/presupuestos/nuevo`}>Nuevo presupuesto</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {budgets.map((b) => (
        <Link
          key={b.id}
          href={`/proyectos/${projectId}/presupuestos/${b.id}`}
          className="flex flex-col rounded-lg border bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
        >
          <div className="flex items-start justify-between gap-2">
            <span className="font-mono text-xs text-muted-foreground">v{b.versionNumber}</span>
            <BudgetStatusBadge status={b.status} />
          </div>
          <h3 className="mt-2 line-clamp-2 font-semibold leading-snug">{b.name}</h3>
          <div className="mt-3 space-y-1 text-sm">
            <div className="flex justify-between gap-2 tabular-nums">
              <span className="text-muted-foreground">Costo directo</span>
              <span>{fmt(b.totalCost, b.currency)}</span>
            </div>
            <div className="flex justify-between gap-2 tabular-nums">
              <span className="text-muted-foreground">Precio venta</span>
              <span className="font-medium">{fmt(b.totalSalePrice, b.currency)}</span>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
