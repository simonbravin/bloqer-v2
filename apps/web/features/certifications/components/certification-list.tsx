import { formatDate, formatDateTime } from "@/lib/format";
import Link from "next/link";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { CertificationStatusBadge } from "./certification-status-badge";
import type { CertificationStatus } from "@bloqer/database";

export type CertificationListItem = {
  id: string;
  projectId: string;
  code: string;
  periodStart: Date;
  periodEnd: Date;
  status: CertificationStatus;
  totalAmount: string;
  currency: string;
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

interface CertificationListProps {
  certifications: CertificationListItem[];
  projectId: string;
}

export function CertificationList({ certifications, projectId }: CertificationListProps) {
  if (certifications.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Sin certificaciones. Cree la primera para registrar avance de obra.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-24">N°</TableHead>
          <TableHead>Período</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead className="text-right">Monto</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {certifications.map((c) => (
          <TableRow key={c.id}>
            <TableCell className="font-mono text-sm font-medium">{c.code}</TableCell>
            <TableCell className="text-sm">
              {fmtDate(c.periodStart)} — {fmtDate(c.periodEnd)}
            </TableCell>
            <TableCell><CertificationStatusBadge status={c.status} /></TableCell>
            <TableCell className="text-right font-mono text-sm">
              {fmtMoney(c.totalAmount, c.currency)}
            </TableCell>
            <TableCell>
              <Button variant="ghost" size="sm" asChild>
                <Link href={`/proyectos/${projectId}/certificaciones/${c.id}`}>Ver</Link>
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
