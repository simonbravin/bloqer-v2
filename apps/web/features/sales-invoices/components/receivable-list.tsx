import Link from "next/link";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ReceivableStatusBadge } from "./receivable-status-badge";
import type { ReceivableStatus } from "@bloqer/database";

export type ReceivableListItem = {
  id: string;
  projectId: string;
  salesInvoiceId: string;
  dueDate: Date;
  status: ReceivableStatus;
  originalAmount: string;
  paidAmount: string;
  balanceDue: string;
  currency: string;
  clientName: string;
};

function fmtDate(d: Date) {
  return new Date(d).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function fmtMoney(value: string, currency: string) {
  return (
    new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
      parseFloat(value),
    ) + " " + currency
  );
}

interface ReceivableListProps {
  receivables: ReceivableListItem[];
  projectId: string;
}

export function ReceivableList({ receivables, projectId }: ReceivableListProps) {
  if (receivables.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Sin cuentas por cobrar. Se crean automáticamente al emitir una factura.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Cliente</TableHead>
          <TableHead>Vencimiento</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead className="text-right">Original</TableHead>
          <TableHead className="text-right">Saldo</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {receivables.map((r) => (
          <TableRow key={r.id}>
            <TableCell className="text-sm">{r.clientName}</TableCell>
            <TableCell className="text-sm">{fmtDate(r.dueDate)}</TableCell>
            <TableCell><ReceivableStatusBadge status={r.status} /></TableCell>
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
  );
}
