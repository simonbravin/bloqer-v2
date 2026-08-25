import Link from "next/link";
import { Suspense } from "react";
import { formatDate } from "@/lib/format";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  tableStickyNameCellClass,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ListEmptyState } from "@/components/ui/list-empty-state";
import { TableScroll } from "@/components/ui/table-scroll";
import { UrlSortableTableHead } from "@/components/ui/url-sortable-table-head";
import { formatMoneyAmount } from "@/lib/format-money";
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
    return (
      <ListEmptyState
        title="Sin cuentas por pagar"
        description="Se generan al emitir una factura de proveedor. También podés ver el circuito completo en Ayuda."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            {supplierInvoiceHrefPrefix ? (
              <Button asChild size="sm" variant="outline">
                <Link href={supplierInvoiceHrefPrefix}>Ver facturas proveedor</Link>
              </Button>
            ) : null}
            <Button asChild size="sm" variant="outline">
              <Link href="/ayuda/pagar-una-cuenta-por-pagar">Cómo se paga una CxP</Link>
            </Button>
          </div>
        }
      />
    );
  }

  return (
    <TableScroll stickyFirstColumn>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Proveedor</TableHead>
            <Suspense fallback={<TableHead>Vencimiento</TableHead>}>
              <UrlSortableTableHead label="Vencimiento" defaultDir="asc" />
            </Suspense>
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
              <TableCell
                className={cn(tableStickyNameCellClass, "font-medium")}
                title={p.supplierName}
              >
                {p.supplierName}
              </TableCell>
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
                {formatMoneyAmount(p.balanceDue, p.currency)}
              </TableCell>
              <TableCell>
                <ObligationSettledCell status={p.status} balanceDue={p.balanceDue} />
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
