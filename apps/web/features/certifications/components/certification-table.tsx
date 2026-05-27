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
import { Button } from "@/components/ui/button";
import { ListEmptyState } from "@/components/ui/list-empty-state";
import { TableScroll } from "@/components/ui/table-scroll";
import { CertificationStatusBadge } from "./certification-status-badge";
import type { CertificationListItem } from "./certification-list";

function fmtMoney(value: string, currency: string) {
  return (
    new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
      parseFloat(value),
    ) +
    " " +
    currency
  );
}

export function CertificationTable({
  certifications,
  projectId,
}: {
  certifications: CertificationListItem[];
  projectId: string;
}) {
  if (certifications.length === 0) {
    return (
      <ListEmptyState message="Sin certificaciones. Cree la primera para registrar avance de obra." />
    );
  }

  return (
    <TableScroll>
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
              <TableCell className="font-mono text-sm font-medium">
                <Link
                  href={`/proyectos/${projectId}/certificaciones/${c.id}`}
                  className="text-primary hover:underline"
                >
                  {c.code}
                </Link>
              </TableCell>
              <TableCell className="text-sm">
                {formatDate(c.periodStart)} — {formatDate(c.periodEnd)}
              </TableCell>
              <TableCell>
                <CertificationStatusBadge status={c.status} />
              </TableCell>
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
    </TableScroll>
  );
}
