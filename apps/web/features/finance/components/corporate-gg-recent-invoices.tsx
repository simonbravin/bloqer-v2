import Link from "next/link";
import { formatDate } from "@/lib/format";
import { formatMoneyAmount } from "@/lib/format-money";
import { DataTableSection } from "@/components/ui/data-table-section";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableScroll } from "@/components/ui/table-scroll";
import { SupplierInvoiceStatusBadge } from "@/features/ap";
import type { SupplierInvoiceListItem } from "@/features/ap";

function ggPeriodFromIssueDate(issueDate: string | Date): string {
  const d = typeof issueDate === "string" ? new Date(issueDate) : issueDate;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

type Props = {
  invoices: SupplierInvoiceListItem[];
};

export function CorporateGgRecentInvoices({ invoices }: Props) {
  return (
    <DataTableSection title="Últimas facturas corporativas">
      {invoices.length === 0 ? (
        <p className="text-sm text-muted-foreground px-1 py-4">
          No hay facturas corporativas registradas.
        </p>
      ) : (
        <TableScroll>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Proveedor</TableHead>
                <TableHead>Emisión</TableHead>
                <TableHead>Período GG</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell className="font-mono text-sm">
                    <Link
                      href={`/finanzas/facturas-proveedor/${inv.id}`}
                      className="text-primary hover:underline"
                    >
                      {inv.code}
                    </Link>
                  </TableCell>
                  <TableCell className="font-medium">{inv.supplierName}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(inv.issueDate)}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {ggPeriodFromIssueDate(inv.issueDate)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {formatMoneyAmount(inv.totalAmount, inv.currency)}
                  </TableCell>
                  <TableCell>
                    <SupplierInvoiceStatusBadge status={inv.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableScroll>
      )}
    </DataTableSection>
  );
}
