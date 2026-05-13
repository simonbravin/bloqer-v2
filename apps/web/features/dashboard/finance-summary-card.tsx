import Link from "next/link";
import type { DashboardFinanceSummary } from "@bloqer/services";
import { formatDashboardMoney } from "@bloqer/services";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

function moneyLine(
  label: string,
  raw: string | null | undefined,
  currency: string | null | undefined,
  multicurrency?: boolean,
) {
  if (multicurrency) {
    return (
      <div>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-lg font-semibold">Multimoneda</p>
        <p className="text-xs text-muted-foreground">Ver detalle en Finanzas.</p>
      </div>
    );
  }
  if (raw == null || raw === "") {
    return (
      <div>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-lg font-semibold text-muted-foreground">—</p>
      </div>
    );
  }
  return (
    <div>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{formatDashboardMoney(raw, currency)}</p>
    </div>
  );
}

export function FinanceSummaryCard({ finance }: { finance: DashboardFinanceSummary }) {
  const hasAr =
    finance.receivablesTotal != null ||
    finance.receivablesMulticurrency ||
    (finance.overdueReceivablesCount ?? 0) > 0;
  const hasAp =
    finance.payablesTotal != null ||
    finance.payablesMulticurrency ||
    (finance.overduePayablesCount ?? 0) > 0;
  const hasTr = Boolean(finance.cashByCurrency && Object.keys(finance.cashByCurrency).length > 0);

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle>Finanzas y tesorería</CardTitle>
        <CardDescription>Resumen de posiciones abiertas según tus permisos.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {hasAr ? (
            <div className="space-y-2">
              {moneyLine(
                "Cuentas por cobrar (abierto)",
                finance.receivablesTotal ?? null,
                finance.receivablesCurrency ?? null,
                finance.receivablesMulticurrency,
              )}
              {(finance.overdueReceivablesCount ?? 0) > 0 ? (
                <p className="text-xs text-destructive">Vencidas (líneas): {finance.overdueReceivablesCount}</p>
              ) : (
                <p className="text-xs text-muted-foreground">Sin líneas vencidas pendientes.</p>
              )}
            </div>
          ) : null}

          {hasAp ? (
            <div className="space-y-2">
              {moneyLine(
                "Cuentas por pagar (abierto)",
                finance.payablesTotal ?? null,
                finance.payablesCurrency ?? null,
                finance.payablesMulticurrency,
              )}
              {(finance.overduePayablesCount ?? 0) > 0 ? (
                <p className="text-xs text-destructive">Vencidas (líneas): {finance.overduePayablesCount}</p>
              ) : (
                <p className="text-xs text-muted-foreground">Sin líneas vencidas pendientes.</p>
              )}
            </div>
          ) : null}

          {hasTr ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Caja / bancos</p>
              {finance.cashMulticurrency ? <p className="text-lg font-semibold">Multimoneda</p> : null}
              <ul className="space-y-1 text-sm">
                {Object.entries(finance.cashByCurrency ?? {}).map(([cur, raw]) => (
                  <li key={cur} className="flex justify-between gap-2 tabular-nums">
                    <span className="text-muted-foreground">{cur}</span>
                    <span className="font-medium">{formatDashboardMoney(raw, cur.length === 3 ? cur : undefined)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          {(hasAr || hasAp) && (
            <Button asChild variant="outline" size="sm">
              <Link href="/finanzas">Finanzas</Link>
            </Button>
          )}
          {hasTr && (
            <Button asChild variant="outline" size="sm">
              <Link href="/tesoreria">Tesorería</Link>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
