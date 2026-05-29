"use client";

import Link from "next/link";
import type { CertificationPortfolioRow } from "@bloqer/services";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableScroll } from "@/components/ui/table-scroll";
import { cn } from "@/lib/utils";

const PAYMENT_LABEL: Record<CertificationPortfolioRow["paymentStatus"], string> = {
  NOT_INVOICED: "Sin facturar",
  UNPAID: "Impago",
  PARTIAL: "Cobro parcial",
  PAID: "Cobrado",
  OVERDUE: "Vencido",
};

function fmt(value: string) {
  return parseFloat(value).toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

type Props = {
  rows: CertificationPortfolioRow[];
  projectId: string;
};

export function CertificationPortfolioTable({ rows, projectId }: Props) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8 rounded-lg border bg-card">
        No hay certificaciones emitidas o aprobadas en este presupuesto.
      </p>
    );
  }

  return (
    <TableScroll>
      <Table className="text-xs">
        <TableHeader className="sticky top-0 z-10 bg-muted/50">
          <TableRow>
            <TableHead>Cert.</TableHead>
            <TableHead>Período</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="text-right">Certificado</TableHead>
            <TableHead className="text-right">Facturado</TableHead>
            <TableHead className="text-right">Cobrado</TableHead>
            <TableHead>Cobranza</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.certificationId}>
              <TableCell className="font-mono">
                <Link
                  href={`/proyectos/${projectId}/certificaciones/${row.certificationId}`}
                  className="text-primary hover:underline"
                >
                  {row.code}
                </Link>
              </TableCell>
              <TableCell className="text-muted-foreground whitespace-nowrap">
                {row.periodStart} → {row.periodEnd}
              </TableCell>
              <TableCell>{row.status}</TableCell>
              <TableCell className="text-right font-mono">{fmt(row.totalAmount)}</TableCell>
              <TableCell className="text-right font-mono text-muted-foreground">
                {fmt(row.invoicedAmount)}
              </TableCell>
              <TableCell className="text-right font-mono text-muted-foreground">
                {fmt(row.collectedAmount)}
              </TableCell>
              <TableCell>
                <span
                  className={cn(
                    "text-xs font-medium",
                    row.paymentStatus === "PAID" && "text-emerald-600",
                    row.paymentStatus === "OVERDUE" && "text-destructive",
                    row.paymentStatus === "NOT_INVOICED" && "text-amber-600",
                  )}
                >
                  {PAYMENT_LABEL[row.paymentStatus]}
                </span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableScroll>
  );
}
