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
import type { SubcontractView } from "@bloqer/services";
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
    <div className="rounded-lg border">
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
              <TableCell className="font-medium">
                <Link href={`/proyectos/${projectId}/subcontratos/${s.id}`} className="hover:underline">
                  {s.title}
                </Link>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">{s.subcontractorName}</TableCell>
              <TableCell className="text-right tabular-nums">
                {parseFloat(s.totalValue).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
              </TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">
                {parseFloat(s.totalCertified).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
              </TableCell>
              <TableCell>
                <SubcontractStatusBadge status={s.status} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
