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

function fmt(value: string) {
  return parseFloat(value).toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

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
            const v = parseFloat(row.varianceCommitted);
            return (
              <TableRow key={row.wbsNodeId}>
                <TableCell className="font-mono">{row.wbsCode}</TableCell>
                <TableCell className="max-w-[min(18rem,35vw)] truncate" title={row.wbsName}>
                  {row.wbsName}
                </TableCell>
                <TableCell className="text-right font-mono">{fmt(row.budgetSubcontract)}</TableCell>
                <TableCell className="text-right font-mono">{fmt(row.committedCost)}</TableCell>
                <TableCell className="text-right font-mono">{fmt(row.certifiedCost)}</TableCell>
                <TableCell
                  className={`text-right font-mono ${v > 0.01 ? "text-destructive" : v < -0.01 ? "text-emerald-600" : ""}`}
                >
                  {fmt(row.varianceCommitted)}
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
