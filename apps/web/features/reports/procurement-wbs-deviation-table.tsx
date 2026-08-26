"use client";

import type { ProcurementWbsDeviationRow } from "@bloqer/services";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableScroll } from "@/components/ui/table-scroll";
import { formatMoneyAmount, formatRatePctWithSymbol, isPositiveMoneyAmount, isZeroMoneyAmount } from "@/lib/format-money";

type Props = {
  rows: ProcurementWbsDeviationRow[];
};

export function ProcurementWbsDeviationTable({ rows }: Props) {
  return (
    <TableScroll>
      <Table className="text-xs">
        <TableHeader className="sticky top-0 z-10 bg-muted/50">
          <TableRow>
            <TableHead className="w-24">Partida</TableHead>
            <TableHead>Ítem</TableHead>
            <TableHead className="text-right">Presup. material</TableHead>
            <TableHead className="text-right">Comprometido</TableHead>
            <TableHead className="text-right">Devengado</TableHead>
            <TableHead className="text-right">Variación</TableHead>
            <TableHead className="text-right">%</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const over = isPositiveMoneyAmount(row.varianceAmount);
            const zero = isZeroMoneyAmount(row.varianceAmount);
            return (
              <TableRow key={row.wbsNodeId}>
                <TableCell className="font-mono">{row.wbsCode}</TableCell>
                <TableCell className="max-w-[min(18rem,35vw)] truncate" title={row.wbsName}>
                  {row.wbsName}
                </TableCell>
                <TableCell className="text-right font-mono">{formatMoneyAmount(row.budgetMaterial)}</TableCell>
                <TableCell className="text-right font-mono">{formatMoneyAmount(row.committedCost)}</TableCell>
                <TableCell className="text-right font-mono">{formatMoneyAmount(row.accruedCost)}</TableCell>
                <TableCell
                  className={`text-right font-mono ${zero ? "" : over ? "text-destructive" : "text-emerald-600"}`}
                >
                  {formatMoneyAmount(row.varianceAmount)}
                </TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {formatRatePctWithSymbol(row.variancePct)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableScroll>
  );
}
