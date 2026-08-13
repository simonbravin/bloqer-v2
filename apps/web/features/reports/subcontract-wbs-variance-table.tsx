"use client";

import Link from "next/link";
import type { SubcontractWbsVarianceRow } from "@bloqer/services";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableScroll } from "@/components/ui/table-scroll";
import { formatMoneyAmount, isPositiveMoneyAmount, isZeroMoneyAmount } from "@/lib/format-money";

const STATUS_LABELS: Record<SubcontractWbsVarianceRow["status"], string> = {
  OK: "OK",
  UNDER: "Bajo presup.",
  OVER: "Sobre presup.",
  NO_BASELINE: "Sin baseline",
  PENDING_CONTRACT: "Sin contrato",
};

type Props = {
  rows: SubcontractWbsVarianceRow[];
  projectId: string;
};

export function SubcontractWbsVarianceTable({ rows, projectId }: Props) {
  return (
    <TableScroll>
      <Table className="text-xs">
        <TableHeader className="sticky top-0 z-10 bg-muted/50">
          <TableRow>
            <TableHead className="w-24">Partida</TableHead>
            <TableHead>Ítem</TableHead>
            <TableHead className="text-right">Presup. sub</TableHead>
            <TableHead className="text-right">Contratado</TableHead>
            <TableHead className="text-right">Certificado</TableHead>
            <TableHead className="text-right">Variación</TableHead>
            <TableHead className="w-28">Estado</TableHead>
            <TableHead className="w-32" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const over = isPositiveMoneyAmount(row.varianceCommitted);
            const zero = isZeroMoneyAmount(row.varianceCommitted);
            return (
              <TableRow key={row.wbsNodeId}>
                <TableCell className="font-mono">{row.wbsCode}</TableCell>
                <TableCell className="max-w-[min(18rem,35vw)] truncate" title={row.wbsName}>
                  {row.wbsName}
                </TableCell>
                <TableCell className="text-right font-mono">{formatMoneyAmount(row.budgetSubcontract)}</TableCell>
                <TableCell className="text-right font-mono">{formatMoneyAmount(row.committedCost)}</TableCell>
                <TableCell className="text-right font-mono">{formatMoneyAmount(row.certifiedCost)}</TableCell>
                <TableCell
                  className={`text-right font-mono ${zero ? "" : over ? "text-destructive" : "text-emerald-600"}`}
                >
                  {formatMoneyAmount(row.varianceCommitted)}
                </TableCell>
                <TableCell className="text-muted-foreground">{STATUS_LABELS[row.status]}</TableCell>
                <TableCell>
                  {row.status === "PENDING_CONTRACT" ? (
                    <Button variant="outline" size="sm" className="h-7" asChild>
                      <Link
                        href={`/proyectos/${projectId}/subcontratos/nuevo?wbsNodeId=${row.wbsNodeId}&from=report-sub`}
                      >
                        Crear contrato
                      </Link>
                    </Button>
                  ) : null}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableScroll>
  );
}
