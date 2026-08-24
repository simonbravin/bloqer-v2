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
import { ListEmptyState } from "@/components/ui/list-empty-state";
import { TableScroll } from "@/components/ui/table-scroll";
import type { SubcontractView } from "@bloqer/services";
import { formatMoneyAmount } from "@/lib/format-money";
import { SubcontractStatusBadge } from "./subcontract-status-badge";

export function SubcontractTable({
  subcontracts,
  projectId,
}: {
  subcontracts: SubcontractView[];
  projectId: string;
}) {
  if (subcontracts.length === 0) {
    return <ListEmptyState message="No hay subcontratos en este proyecto." />;
  }

  return (
    <TableScroll>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Código</TableHead>
            <TableHead>Título</TableHead>
            <TableHead>Subcontratista</TableHead>
            <TableHead className="text-right">Valor total</TableHead>
            <TableHead className="text-right">Certificado</TableHead>
            <TableHead>Estado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {subcontracts.map((s) => (
            <TableRow key={s.id}>
              <TableCell className="font-mono text-sm">
                <Link
                  href={`/proyectos/${projectId}/subcontratos/${s.id}`}
                  className="text-primary hover:underline"
                >
                  {s.code}
                </Link>
              </TableCell>
              <TableCell className={tableNameCellClass}>
                <Link
                  href={`/proyectos/${projectId}/subcontratos/${s.id}`}
                  className="block truncate font-medium hover:underline"
                  title={s.title}
                >
                  {s.title}
                </Link>
              </TableCell>
              <TableCell
                className="max-w-[12rem] truncate text-sm text-muted-foreground"
                title={s.subcontractorName}
              >
                {s.subcontractorName}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatMoneyAmount(s.totalValue, s.currency)}
              </TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">
                {formatMoneyAmount(s.totalCertified, s.currency)}
              </TableCell>
              <TableCell>
                <SubcontractStatusBadge status={s.status} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableScroll>
  );
}
