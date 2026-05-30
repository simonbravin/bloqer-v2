import Link from "next/link";
import type { FinanceProjectionSummary } from "@bloqer/services";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableScroll } from "@/components/ui/table-scroll";

function formatMoney(raw: string, currency: string): string {
  const n = Number(raw);
  if (Number.isNaN(n)) return raw;
  try {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${raw} ${currency}`;
  }
}

export function FinanceProjectionPanel({ projection }: { projection: FinanceProjectionSummary }) {
  const hasProjectionRows = projection.rows.length > 0;

  return (
    <Card className="rounded-xl border bg-card shadow-sm">
      <CardHeader className="border-b border-border/60 pb-4">
        <CardTitle className="text-base">Proyección de liquidez (90 días)</CardTitle>
        <CardDescription>
          Saldo de caja hoy menos egresos por C×P corporativas con vencimiento hasta{" "}
          {projection.dateTo} (incluye vencidas).{" "}
          <Link href={projection.href} className="underline underline-offset-2">
            Ver obligaciones
          </Link>
        </CardDescription>
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
                      {formatMoney(row.cashBalance, row.currency)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {formatMoney(row.expectedOutflows90d, row.currency)}
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
                      {formatMoney(row.projectedBalance, row.currency)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableScroll>
        ) : (
          <p className="text-sm text-muted-foreground">
            No hay egresos esperados por C×P corporativas en el horizonte de 90 días.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
