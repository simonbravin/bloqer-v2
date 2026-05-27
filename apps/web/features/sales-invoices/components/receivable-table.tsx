import Link from "next/link";
import { formatDate } from "@/lib/format";
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
import { ReceivableStatusBadge } from "./receivable-status-badge";
import type { ReceivableListItem } from "./receivable-list";

function fmtMoney(value: string, currency: string) {
  return (
    new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
      parseFloat(value),
    ) +
    " " +
    currency
  );
}

export function ReceivableTable({
  receivables,
  projectId,
}: {
  receivables: ReceivableListItem[];
  projectId: string;
}) {
  if (receivables.length === 0) {
    return (
      <ListEmptyState message="Sin cuentas por cobrar. Se crean automáticamente al emitir una factura." />
    );
  }

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Cliente</TableHead>
            <TableHead>Vencimiento</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="text-right">Original</TableHead>
            <TableHead className="text-right">Saldo</TableHead>
            <TableHead className="w-20" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {receivables.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="text-sm">{r.clientName}</TableCell>
              <TableCell className="text-sm">{formatDate(r.dueDate)}</TableCell>
              <TableCell>
                <ReceivableStatusBadge status={r.status} />
              </TableCell>
              <TableCell className="text-right font-mono text-sm">
                {fmtMoney(r.originalAmount, r.currency)}
              </TableCell>
              <TableCell className="text-right font-mono text-sm">
                {fmtMoney(r.balanceDue, r.currency)}
              </TableCell>
              <TableCell>
                <Button variant="ghost" size="sm" asChild>
                  <Link href={`/proyectos/${projectId}/cuentas-por-cobrar/${r.id}`}>Ver</Link>
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
