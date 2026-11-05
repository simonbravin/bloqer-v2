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
import { formatMoneyAmount } from "@/lib/format-money";

type Props = {
  rows: ProcurementSupplierRow[];
  apAvailable: boolean;
  currency: string;
};

export function ProcurementSupplierTable({ rows, apAvailable, currency }: Props) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">Sin compras para el período seleccionado.</p>;
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
              <TableCell className="text-right font-mono">{formatMoneyAmount(row.committedCost, currency)}</TableCell>
              <TableCell className="text-right font-mono">{apAvailable ? formatMoneyAmount(row.accruedCost, currency) : "—"}</TableCell>
              <TableCell className="text-right font-mono">{apAvailable ? formatMoneyAmount(row.paidCost, currency) : "—"}</TableCell>
              <TableCell className="text-right font-mono">{apAvailable ? formatMoneyAmount(row.openCommitted, currency) : "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableScroll>
  );
}
