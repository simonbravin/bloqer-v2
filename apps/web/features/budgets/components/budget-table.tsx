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
import { BudgetStatusBadge } from "./budget-status-badge";
import type { BudgetListItem } from "./budget-list";

function fmt(value: string, currency: string) {
  return (
    new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
      parseFloat(value),
    ) +
    " " +
    currency
  );
}

export function BudgetTable({
  budgets,
  projectId,
}: {
  budgets: BudgetListItem[];
  projectId: string;
}) {
  if (budgets.length === 0) {
    return <ListEmptyState message="No hay presupuestos. Cree la primera versión." />;
  }

  return (
    <div className="rounded-lg border">
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
              <TableCell className="font-medium">{b.name}</TableCell>
              <TableCell>
                <BudgetStatusBadge status={b.status} />
              </TableCell>
              <TableCell className="text-right font-mono text-sm">{fmt(b.totalCost, b.currency)}</TableCell>
              <TableCell className="text-right font-mono text-sm">
                {fmt(b.totalSalePrice, b.currency)}
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
    </div>
  );
}
