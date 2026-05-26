import { formatDate, formatDateTime } from "@/lib/format";
import Link from "next/link";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { SalesInvoiceStatusBadge } from "./sales-invoice-status-badge";
import type { SalesInvoiceStatus } from "@bloqer/database";

export type SalesInvoiceListItem = {
  id: string;
  projectId: string;
  code: string;
  issueDate: Date;
  dueDate: Date;
  status: SalesInvoiceStatus;
  totalAmount: string;
  currency: string;
  clientName: string;
};

function fmtDate(d: Date) {
  return formatDate(d);
}

function fmtMoney(value: string, currency: string) {
  return (
    new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
      parseFloat(value),
    ) + " " + currency
  );
}

interface SalesInvoiceListProps {
  invoices: SalesInvoiceListItem[];
  projectId: string;
}

export function SalesInvoiceList({ invoices, projectId }: SalesInvoiceListProps) {
  if (invoices.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Sin facturas. Cree la primera manualmente o desde una certificación aprobada.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-28">N°</TableHead>
          <TableHead>Cliente</TableHead>
          <TableHead>Emisión / Vto.</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead className="text-right">Total</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {invoices.map((inv) => (
          <TableRow key={inv.id}>
            <TableCell className="font-mono text-sm font-medium">{inv.code}</TableCell>
            <TableCell className="text-sm">{inv.clientName}</TableCell>
            <TableCell className="text-sm">
              {fmtDate(inv.issueDate)} / {fmtDate(inv.dueDate)}
            </TableCell>
            <TableCell><SalesInvoiceStatusBadge status={inv.status} /></TableCell>
            <TableCell className="text-right font-mono text-sm">
              {fmtMoney(inv.totalAmount, inv.currency)}
            </TableCell>
            <TableCell>
              <Button variant="ghost" size="sm" asChild>
                <Link href={`/proyectos/${projectId}/facturas/${inv.id}`}>Ver</Link>
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
