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
} from "@/components/ui/table";
import { ListEmptyState } from "@/components/ui/list-empty-state";
import { TableScroll } from "@/components/ui/table-scroll";
import { UrlSortableTableHead } from "@/components/ui/url-sortable-table-head";
import { SupplierInvoiceStatusBadge } from "./supplier-invoice-status-badge";
import { PayableStatusBadge } from "./payable-status-badge";
import type { SupplierInvoiceListItem } from "./supplier-invoice-list";

const PAYABLE_OPEN = new Set(["OPEN", "PARTIAL", "OVERDUE"]);

export function SupplierInvoiceTable({
  invoices,
  hrefPrefix,
  payableHrefPrefix,
}: {
  invoices: SupplierInvoiceListItem[];
  hrefPrefix: string;
  /** Base path for CxP detail/pay, e.g. `/finanzas/cuentas-por-pagar` or `/proyectos/:id/cuentas-por-pagar`. */
  payableHrefPrefix?: string;
}) {
  if (invoices.length === 0) {
    return (
      <ListEmptyState message="No hay facturas de proveedor registradas." />
    );
  }

  return (
    <TableScroll>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Código</TableHead>
            <TableHead>Proveedor</TableHead>
            <Suspense fallback={<TableHead>Emisión</TableHead>}>
              <UrlSortableTableHead label="Emisión" defaultDir="desc" />
            </Suspense>
            <TableHead>Vencimiento</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Pago</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invoices.map((inv) => {
            const canPay =
              Boolean(payableHrefPrefix) &&
              inv.payableId &&
              inv.payableStatus &&
              PAYABLE_OPEN.has(inv.payableStatus);
            return (
              <TableRow key={inv.id}>
                <TableCell className="font-mono text-sm">
                  <Link
                    href={`${hrefPrefix}/${inv.id}`}
                    className="text-primary hover:underline"
                  >
                    {inv.code}
                  </Link>
                </TableCell>
                <TableCell className="font-medium">{inv.supplierName}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {formatDate(inv.issueDate)}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {formatDate(inv.dueDate)}
                </TableCell>
                <TableCell className="text-right tabular-nums font-medium">
                  {Number(inv.totalAmount).toLocaleString("es-AR", {
                    style: "currency",
                    currency: inv.currency,
                  })}
                </TableCell>
                <TableCell>
                  <SupplierInvoiceStatusBadge status={inv.status} />
                </TableCell>
                <TableCell>
                  {inv.payableId && inv.payableStatus ? (
                    canPay ? (
                      <Link
                        href={`${payableHrefPrefix}/${inv.payableId}/pagar`}
                        className="inline-flex hover:opacity-90"
                        title="Registrar pago (total o parcial)"
                      >
                        <PayableStatusBadge status={inv.payableStatus} />
                      </Link>
                    ) : (
                      <PayableStatusBadge status={inv.payableStatus} />
                    )
                  ) : (
                    <span className="text-muted-foreground text-sm">—</span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableScroll>
  );
}
