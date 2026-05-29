import Link from "next/link";
import type { TransaccionesOverview } from "@bloqer/services";
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
import { KpiStatGrid } from "@/components/ui/kpi-stat-grid";
import { DashboardKpiCard } from "@/features/dashboard/dashboard-kpi-card";

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

export function TransaccionesOverviewPanel({ overview }: { overview: TransaccionesOverview }) {
  if (!overview.visible) return null;

  const projection = overview.projection;
  const hasProjectionRows = (projection?.rows.length ?? 0) > 0;

  return (
    <div className="space-y-6">
      {overview.alerts.length > 0 ? (
        <div className="space-y-2">
          {overview.alerts.map((a) => (
            <div
              key={a.message}
              role="note"
              className={
                a.variant === "warning"
                  ? "rounded-xl border border-destructive/35 bg-destructive/5 px-4 py-3 text-sm"
                  : "rounded-xl border border-border/80 bg-muted/30 px-4 py-3 text-sm text-muted-foreground"
              }
            >
              {a.message}
            </div>
          ))}
        </div>
      ) : null}

      {overview.kpis.length > 0 ? (
        <KpiStatGrid title="Indicadores" columns={4}>
          {overview.kpis.map((k) => (
            <DashboardKpiCard key={k.key} kpi={k} />
          ))}
        </KpiStatGrid>
      ) : null}

      {projection ? (
        <Card className="rounded-xl border bg-card shadow-sm">
          <CardHeader className="border-b border-border/60 pb-4">
            <CardTitle className="text-base">Proyección de liquidez (90 días)</CardTitle>
            <CardDescription>
              Saldo de caja hoy menos egresos por C×P corporativas con vencimiento hasta{" "}
              {projection.dateTo} (incluye vencidas). El KPI &quot;C×P corporativas&quot; muestra el
              saldo total abierto sin límite de plazo.{" "}
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
      ) : null}
    </div>
  );
}
