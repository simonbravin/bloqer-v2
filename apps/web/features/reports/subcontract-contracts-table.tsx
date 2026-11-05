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
import { SubcontractStatusBadge } from "@/features/subcontracts/components/subcontract-status-badge";
import { formatMoneyAmount } from "@/lib/format-money";

type Props = {
  rows: SubcontractContractRow[];
  projectId: string;
  currency: string;
};

export function SubcontractContractsTable({ rows, projectId, currency }: Props) {
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
            <TableHead className="w-20">EDT</TableHead>
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
              <TableCell className="text-right font-mono">{formatMoneyAmount(row.totalValue, currency)}</TableCell>
              <TableCell className="text-right font-mono">{formatMoneyAmount(row.certifiedCost, currency)}</TableCell>
              <TableCell><SubcontractStatusBadge status={row.status} /></TableCell>
              <TableCell>{row.wbsLinked ? "Sí" : "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableScroll>
  );
}
