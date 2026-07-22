import { formatDate } from "@/lib/format";
import Link from "next/link";
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
import { SalesInvoiceStatusBadge } from "./sales-invoice-status-badge";
import type { SalesInvoiceListItem } from "./sales-invoice-list";
import { formatMoneyAmount } from "@/lib/format-money";

export function SalesInvoiceTable({
  invoices,
  projectId,
}: {
  invoices: SalesInvoiceListItem[];
  projectId: string;
}) {
  if (invoices.length === 0) {
    return (
      <ListEmptyState message="Sin facturas. Cree la primera manualmente o desde una certificación aprobada." />
    );
  }

  return (
    <TableScroll>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-28">N°</TableHead>
            <TableHead>Cliente</TableHead>
            <TableHead>Emisión / Vto.</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="text-right">Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invoices.map((inv) => (
            <TableRow key={inv.id}>
              <TableCell className="font-mono text-sm font-medium">
                <Link
                  href={`/proyectos/${projectId}/facturas/${inv.id}`}
                  className="text-primary hover:underline"
                >
                  {inv.code}
                </Link>
              </TableCell>
              <TableCell className="text-sm">{inv.clientName}</TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {formatDate(inv.issueDate)} / {formatDate(inv.dueDate)}
              </TableCell>
              <TableCell>
                <SalesInvoiceStatusBadge status={inv.status} />
              </TableCell>
              <TableCell className="text-right font-mono text-sm">
                {formatMoneyAmount(inv.totalAmount)} {inv.currency}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableScroll>
  );
}
