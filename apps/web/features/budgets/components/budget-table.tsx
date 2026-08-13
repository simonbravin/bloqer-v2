import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ListEmptyState } from "@/components/ui/list-empty-state";
import { TableScroll } from "@/components/ui/table-scroll";
import { formatMoneyAmount } from "@/lib/format-money";
import { BudgetStatusBadge } from "./budget-status-badge";
import type { BudgetListItem } from "./budget-list";

export function BudgetTable({
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
    <TableScroll stickyFirstColumn>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">Ver.</TableHead>
            <TableHead>Nombre</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="text-right">Costo directo</TableHead>
            <TableHead className="text-right">Precio venta</TableHead>
            <TableHead className="w-20" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {budgets.map((b) => (
            <TableRow key={b.id}>
              <TableCell className="font-mono text-sm text-muted-foreground">v{b.versionNumber}</TableCell>
              <TableCell>
                <div className="font-medium">{b.name}</div>
                {b.parentBudgetId && b.parentVersionNumber != null && (
                  <p className="text-xs text-muted-foreground">
                    Adenda de v{b.parentVersionNumber}
                    {b.parentName ? ` — ${b.parentName}` : ""}
                  </p>
                )}
              </TableCell>
              <TableCell>
                <BudgetStatusBadge status={b.status} />
              </TableCell>
              <TableCell className="text-right font-mono text-sm">
                {formatMoneyAmount(b.totalCost, b.currency)}
              </TableCell>
              <TableCell className="text-right font-mono text-sm">
                {formatMoneyAmount(b.totalSalePrice, b.currency)}
              </TableCell>
              <TableCell>
                <Button variant="ghost" size="sm" asChild>
                  <Link href={`/proyectos/${projectId}/presupuestos/${b.id}`}>Ver</Link>
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableScroll>
  );
}
