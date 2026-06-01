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
import { PayableStatusBadge } from "./payable-status-badge";
import type { PayableListItem } from "./payable-list";

export function PayableTable({
  payables,
  hrefPrefix,
  supplierInvoiceHrefPrefix,
}: {
  payables: PayableListItem[];
  hrefPrefix: string;
  supplierInvoiceHrefPrefix?: string;
}) {
  if (payables.length === 0) {
    return <ListEmptyState message="No hay cuentas por pagar registradas." />;
  }

  return (
    <TableScroll>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Proveedor</TableHead>
            <TableHead>Vencimiento</TableHead>
            <TableHead>Factura</TableHead>
            <TableHead className="text-right">Saldo</TableHead>
            <TableHead>Pagada</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="w-20" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {payables.map((p) => (
            <TableRow key={p.id}>
              <TableCell className="font-medium">{p.supplierName}</TableCell>
              <TableCell className="text-sm">{formatDate(p.dueDate)}</TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {p.supplierInvoiceCode && p.supplierInvoiceId && supplierInvoiceHrefPrefix ? (
                  <Link
                    href={`${supplierInvoiceHrefPrefix}/${p.supplierInvoiceId}`}
                    className="hover:underline"
                  >
                    {p.supplierInvoiceCode}
                  </Link>
                ) : (
                  "—"
                )}
              </TableCell>
              <TableCell className="text-right font-mono text-sm tabular-nums">
                {Number(p.balanceDue).toLocaleString("es-AR", {
                  style: "currency",
                  currency: p.currency,
                })}
              </TableCell>
              <TableCell>
                <ObligationSettledCell status={p.status} />
              </TableCell>
              <TableCell>
                <PayableStatusBadge status={p.status} />
              </TableCell>
              <TableCell>
                <Button variant="ghost" size="sm" asChild>
                  <Link href={`${hrefPrefix}/${p.id}`}>Ver</Link>
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableScroll>
  );
}
