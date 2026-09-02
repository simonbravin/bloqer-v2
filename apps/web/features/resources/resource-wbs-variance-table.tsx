"use client";

import type { ResourceWbsVarianceRow } from "@bloqer/services";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableScroll } from "@/components/ui/table-scroll";
import { formatMoneyAmount } from "@/lib/format-money";

type Props = { rows: ResourceWbsVarianceRow[] };

export function ResourceWbsVarianceTable({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <p className="p-4 text-sm text-muted-foreground">
        No hay partidas con presupuesto o gasto facturado de este tipo.
      </p>
    );
  }

  return (
    <TableScroll>
      <Table className="text-xs">
        <TableHeader className="sticky top-0 z-10 bg-muted/50">
          <TableRow>
            <TableHead className="w-24">Partida</TableHead>
            <TableHead>Ítem</TableHead>
            <TableHead className="text-right">Presupuesto</TableHead>
            <TableHead className="text-right">Facturado (neto)</TableHead>
            <TableHead className="text-right">Variación</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.wbsNodeId}>
              <TableCell className="font-mono">{row.wbsCode}</TableCell>
              <TableCell className="max-w-[min(18rem,35vw)] truncate" title={row.wbsName}>
                {row.wbsName}
              </TableCell>
              <TableCell className="text-right font-mono">{formatMoneyAmount(row.budgetCost)}</TableCell>
              <TableCell className="text-right font-mono">{formatMoneyAmount(row.accruedCost)}</TableCell>
              <TableCell className="text-right font-mono">{formatMoneyAmount(row.variance)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className="px-1 pt-2 text-xs text-muted-foreground">
        Facturado = neto sin IVA (misma base que EDT y costos).
      </p>
    </TableScroll>
  );
}
