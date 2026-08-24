import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ListEmptyState } from "@/components/ui/list-empty-state";
import { formatMoneyAmount } from "@/lib/format-money";
import { BudgetStatusBadge } from "./budget-status-badge";
import type { BudgetListItem } from "./budget-list";

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
        description="Creá el primer presupuesto del proyecto. Después podés crear una adenda vinculada a uno aprobado o cerrado."
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
          className="flex min-w-0 flex-col rounded-lg border bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
        >
          <div className="flex items-start justify-between gap-2">
            <span className="shrink-0 font-mono text-xs text-muted-foreground">v{b.versionNumber}</span>
            <span className="shrink-0">
              <BudgetStatusBadge status={b.status} />
            </span>
          </div>
          <h3 className="mt-2 truncate font-semibold leading-snug" title={b.name}>
            {b.name}
          </h3>
          {b.parentBudgetId && b.parentVersionNumber != null && (
            <p className="mt-1 truncate text-xs text-muted-foreground">
              Adenda de v{b.parentVersionNumber}
              {b.parentName ? ` — ${b.parentName}` : ""}
            </p>
          )}
          <div className="mt-3 space-y-1 text-sm">
            <div className="flex justify-between gap-2 tabular-nums">
              <span className="text-muted-foreground">Costo directo</span>
              <span>{formatMoneyAmount(b.totalCost, b.currency)}</span>
            </div>
            <div className="flex justify-between gap-2 tabular-nums">
              <span className="text-muted-foreground">Precio venta</span>
              <span className="font-medium">{formatMoneyAmount(b.totalSalePrice, b.currency)}</span>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
