import { formatDate } from "@/lib/format";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  tableNameCellClass,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { ListEmptyState } from "@/components/ui/list-empty-state";
import { TableScroll } from "@/components/ui/table-scroll";
import { SalesInvoiceStatusBadge } from "./sales-invoice-status-badge";
import type { SalesInvoiceListItem } from "./sales-invoice-list";
import { formatMoneyAmount } from "@/lib/format-money";
import { formatInvoiceLetterBadge } from "@bloqer/domain";
import { DocumentClassBadge } from "@/features/finance/components/document-class-badge";

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
            <TableHead>N°</TableHead>
            <TableHead>Letra</TableHead>
            <TableHead>Clase</TableHead>
            <TableHead>Cliente</TableHead>
            <TableHead>Emisión / Vto.</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="text-right">Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invoices.map((inv) => {
            const letter = formatInvoiceLetterBadge(inv.invoiceLetter);
            return (
              <TableRow key={inv.id}>
                <TableCell className="font-mono text-sm font-medium">
                  <Link
                    href={`/proyectos/${projectId}/facturas/${inv.id}`}
                    className="text-primary hover:underline"
                  >
                    {inv.code}
                  </Link>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {letter ?? "—"}
                </TableCell>
                <TableCell>
                  {inv.classLabel ? (
                    <DocumentClassBadge
                      classLabel={inv.classLabel}
                      classFamily={inv.classFamily}
                    />
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className={cn(tableNameCellClass, "font-medium")} title={inv.clientName}>
                  {inv.clientName}
                </TableCell>
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
            );
          })}
        </TableBody>
      </Table>
    </TableScroll>
  );
}
