"use client";

import type { ProcurementUnallocatedRow } from "@bloqer/services";
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

const DOC_LABELS: Record<ProcurementUnallocatedRow["documentType"], string> = {
  PO_LINE: "OC",
  SUPPLIER_INVOICE: "Factura",
};

type Props = {
  rows: ProcurementUnallocatedRow[];
};

export function ProcurementUnallocatedTable({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">
        No hay líneas de compra sin partida WBS en el período.
      </p>
    );
  }

  return (
    <TableScroll>
      <Table className="text-xs">
        <TableHeader className="sticky top-0 z-10 bg-muted/50">
          <TableRow>
            <TableHead className="w-16">Tipo</TableHead>
            <TableHead className="w-28">Documento</TableHead>
            <TableHead>Proveedor</TableHead>
            <TableHead>Descripción</TableHead>
            <TableHead className="text-right">Monto</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, i) => (
            <TableRow key={`${row.documentType}-${row.documentCode}-${i}`}>
              <TableCell>{DOC_LABELS[row.documentType]}</TableCell>
              <TableCell className="font-mono">{row.documentCode}</TableCell>
              <TableCell className="max-w-[10rem] truncate" title={row.supplierName}>
                {row.supplierName}
              </TableCell>
              <TableCell className="max-w-[min(16rem,30vw)] truncate" title={row.description}>
                {row.description}
              </TableCell>
              <TableCell className="text-right font-mono">{fmt(row.amount)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableScroll>
  );
}
