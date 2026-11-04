"use client";

import type { MaterialWbsRow } from "@bloqer/services";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableScroll } from "@/components/ui/table-scroll";
import { formatMoneyAmount, formatMoneyDisplay } from "@/lib/format-money";

type Props = { rows: MaterialWbsRow[]; currency?: string };

export function MaterialWbsTable({ rows, currency }: Props) {
  return (
    <TableScroll>
      <Table className="text-xs">
        <TableHeader className="sticky top-0 z-10 bg-muted/50">
          <TableRow>
            <TableHead className="w-24">Partida</TableHead>
            <TableHead>Ítem</TableHead>
            <TableHead className="text-right">Presup. mat.</TableHead>
            <TableHead className="text-right">Consumo</TableHead>
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
              <TableCell className="text-right font-mono">{formatMoneyAmount(row.budgetMaterial, currency)}</TableCell>
              <TableCell className="text-right font-mono" title={row.consumedCost == null ? "Sin valuación trazable" : undefined}>{formatMoneyDisplay(row.consumedCost, currency)}</TableCell>
              <TableCell className="text-right font-mono" title={row.variance == null ? "No calculable: falta valuación del consumo" : undefined}>{formatMoneyDisplay(row.variance, currency)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableScroll>
  );
}
