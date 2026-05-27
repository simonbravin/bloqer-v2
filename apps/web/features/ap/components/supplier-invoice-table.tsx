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
import { ListEmptyState } from "@/components/ui/list-empty-state";
import { TableScroll } from "@/components/ui/table-scroll";
import { SupplierInvoiceStatusBadge } from "./supplier-invoice-status-badge";
import type { SupplierInvoiceListItem } from "./supplier-invoice-list";

export function SupplierInvoiceTable({
  invoices,
  hrefPrefix,
}: {
  invoices: SupplierInvoiceListItem[];
  hrefPrefix: string;
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
            <TableHead>Emisión</TableHead>
            <TableHead>Vencimiento</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead>Estado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invoices.map((inv) => (
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
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableScroll>
  );
}
