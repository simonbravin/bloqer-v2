"use client";

import type { ProcurementSupplierRow } from "@bloqer/services";
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
  rows: ProcurementSupplierRow[];
};

export function ProcurementSupplierTable({ rows }: Props) {
  return (
    <TableScroll>
      <Table className="text-xs">
        <TableHeader className="sticky top-0 z-10 bg-muted/50">
          <TableRow>
            <TableHead>Proveedor</TableHead>
            <TableHead className="text-right">Comprometido</TableHead>
            <TableHead className="text-right">Devengado</TableHead>
            <TableHead className="text-right">Pagado</TableHead>
            <TableHead className="text-right">OC abierta</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.supplierContactId}>
              <TableCell className="max-w-[min(14rem,30vw)] truncate" title={row.supplierName}>
                {row.supplierName}
              </TableCell>
              <TableCell className="text-right font-mono">{fmt(row.committedCost)}</TableCell>
              <TableCell className="text-right font-mono">{fmt(row.accruedCost)}</TableCell>
              <TableCell className="text-right font-mono">{fmt(row.paidCost)}</TableCell>
              <TableCell className="text-right font-mono">{fmt(row.openCommitted)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableScroll>
  );
}
