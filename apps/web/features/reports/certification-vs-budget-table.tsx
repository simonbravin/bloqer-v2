"use client";

import type { CertificationVsBudgetRow } from "@bloqer/services";
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
  rows: CertificationVsBudgetRow[];
};

export function CertificationVsBudgetTable({ rows }: Props) {
  const pending = rows.filter((r) => parseFloat(r.pendingCertify) > 0.01);

  return (
    <div className="space-y-3">
      {pending.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          {pending.length} partida(s) con venta presupuestada pendiente de certificar.
        </p>
      ) : null}
      <TableScroll>
        <Table className="text-xs">
          <TableHeader className="sticky top-0 z-10 bg-muted/50">
            <TableRow>
              <TableHead className="w-24">Partida</TableHead>
              <TableHead>Ítem</TableHead>
              <TableHead className="text-right">Venta presup.</TableHead>
              <TableHead className="text-right">Certificado acum.</TableHead>
              <TableHead className="text-right">%</TableHead>
              <TableHead className="text-right">Pendiente</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.wbsNodeId}>
                <TableCell className="font-mono">{row.wbsCode}</TableCell>
                <TableCell className="max-w-[min(18rem,35vw)] truncate" title={row.wbsName}>
                  {row.wbsName}
                </TableCell>
                <TableCell className="text-right font-mono">{fmt(row.budgetSale)}</TableCell>
                <TableCell className="text-right font-mono">{fmt(row.certifiedCumulative)}</TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {row.certifiedPct != null ? `${row.certifiedPct}%` : "—"}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {parseFloat(row.pendingCertify) > 0.01 ? fmt(row.pendingCertify) : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableScroll>
    </div>
  );
}
