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
import { TableScroll } from "@/components/ui/table-scroll";
import { ObligationSettledCell } from "@/features/finance/components/obligation-settled-cell";
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

type Props = {
  receivables: ReceivableListItem[];
  /** Muestra columna de obra (listado empresa). */
  showProjectColumn?: boolean;
};

export function ReceivableTable({ receivables, showProjectColumn = false }: Props) {
  if (receivables.length === 0) {
    return (
      <ListEmptyState message="Sin cuentas por cobrar. Se crean automáticamente al emitir una factura." />
    );
  }

  return (
    <TableScroll>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Cliente</TableHead>
            {showProjectColumn ? <TableHead>Proyecto</TableHead> : null}
            <TableHead>Vencimiento</TableHead>
            {showProjectColumn ? <TableHead>Factura</TableHead> : null}
            <TableHead>Cobrada</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="text-right">Original</TableHead>
            <TableHead className="text-right">Saldo</TableHead>
            <TableHead className="w-20" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {receivables.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="text-sm font-medium">{r.clientName}</TableCell>
              {showProjectColumn ? (
                <TableCell className="text-sm text-muted-foreground">
                  {r.projectCode ? (
                    <span title={r.projectName}>
                      {r.projectCode}
                      {r.projectName ? ` · ${r.projectName}` : ""}
                    </span>
                  ) : (
                    "—"
                  )}
                </TableCell>
              ) : null}
              <TableCell className="text-sm">{formatDate(r.dueDate)}</TableCell>
              {showProjectColumn ? (
                <TableCell className="text-sm text-muted-foreground">
                  {r.salesInvoiceCode ? (
                    <Link
                      href={`/proyectos/${r.projectId}/facturas/${r.salesInvoiceId}`}
                      className="hover:underline"
                    >
                      {r.salesInvoiceCode}
                    </Link>
                  ) : (
                    "—"
                  )}
                </TableCell>
              ) : null}
              <TableCell>
                <ObligationSettledCell status={r.status} balanceDue={r.balanceDue} />
              </TableCell>
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
                  <Link href={`/proyectos/${r.projectId}/cuentas-por-cobrar/${r.id}`}>Ver</Link>
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableScroll>
  );
}
