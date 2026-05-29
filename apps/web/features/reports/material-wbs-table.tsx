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

function fmt(value: string) {
  return parseFloat(value).toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

type Props = { rows: MaterialWbsRow[] };

export function MaterialWbsTable({ rows }: Props) {
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
              <TableCell className="text-right font-mono">{fmt(row.budgetMaterial)}</TableCell>
              <TableCell className="text-right font-mono">{fmt(row.consumedCost)}</TableCell>
              <TableCell className="text-right font-mono">{fmt(row.variance)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableScroll>
  );
}
