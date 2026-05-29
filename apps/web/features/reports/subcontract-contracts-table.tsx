"use client";

import Link from "next/link";
import type { SubcontractContractRow } from "@bloqer/services";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableScroll } from "@/components/ui/table-scroll";

function fmt(value: string) {
  return parseFloat(value).toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

type Props = {
  rows: SubcontractContractRow[];
  projectId: string;
};

export function SubcontractContractsTable({ rows, projectId }: Props) {
  return (
    <TableScroll>
      <Table className="text-xs">
        <TableHeader className="sticky top-0 z-10 bg-muted/50">
          <TableRow>
            <TableHead className="w-24">Código</TableHead>
            <TableHead>Contrato</TableHead>
            <TableHead>Subcontratista</TableHead>
            <TableHead className="text-right">Valor</TableHead>
            <TableHead className="text-right">Certificado</TableHead>
            <TableHead className="w-24">Estado</TableHead>
            <TableHead className="w-20">WBS</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.subcontractId}>
              <TableCell className="font-mono">
                <Link
                  href={`/proyectos/${projectId}/subcontratos/${row.subcontractId}`}
                  className="text-primary hover:underline"
                >
                  {row.code}
                </Link>
              </TableCell>
              <TableCell className="max-w-[min(14rem,28vw)] truncate" title={row.title}>
                {row.title}
              </TableCell>
              <TableCell className="max-w-[min(12rem,24vw)] truncate" title={row.subcontractorName}>
                {row.subcontractorName}
              </TableCell>
              <TableCell className="text-right font-mono">{fmt(row.totalValue)}</TableCell>
              <TableCell className="text-right font-mono">{fmt(row.certifiedCost)}</TableCell>
              <TableCell className="text-muted-foreground">{row.status}</TableCell>
              <TableCell>{row.wbsLinked ? "Sí" : "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableScroll>
  );
}
