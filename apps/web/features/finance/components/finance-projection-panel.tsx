import Link from "next/link";
import type { FinanceProjectionSummary } from "@bloqer/services";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

export function FinanceProjectionPanel({ projection }: { projection: FinanceProjectionSummary }) {
  const hasProjectionRows = projection.rows.length > 0;

  return (
    <Card className="rounded-xl border bg-card shadow-sm">
      <CardHeader className="border-b border-border/60 pb-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Proyección de liquidez (90 días)</CardTitle>
          <Link href={projection.href} className="text-sm underline underline-offset-2 text-muted-foreground">
            Ver obligaciones
          </Link>
        </div>
        {projection.moduleWarnings.length > 0 ? (
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
            {projection.moduleWarnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        ) : null}
      </CardHeader>
      <CardContent className="pt-4">
        {hasProjectionRows ? (
          <TableScroll>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Moneda</TableHead>
                  <TableHead className="text-right">Caja hoy</TableHead>
                  <TableHead className="text-right">Egresos esperados</TableHead>
                  <TableHead className="text-right">Líneas C×P</TableHead>
                  <TableHead className="text-right">Saldo proyectado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projection.rows.map((row) => (
                  <TableRow key={row.currency}>
                    <TableCell className="font-medium">{row.currency}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoneyAmount(row.cashBalance, row.currency)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {formatMoneyAmount(row.expectedOutflows90d, row.currency)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {row.openPayableCount}
                    </TableCell>
                    <TableCell
                      className={
                        row.isNegative
                          ? "text-right tabular-nums font-medium text-destructive"
                          : "text-right tabular-nums font-medium"
                      }
                    >
                      {formatMoneyAmount(row.projectedBalance, row.currency)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableScroll>
        ) : (
          <p className="text-sm text-muted-foreground">Sin egresos esperados en 90 días.</p>
        )}
      </CardContent>
    </Card>
  );
}
