import Link from "next/link";
import type { DashboardFinanceSummary } from "@bloqer/services";
import { formatDashboardMoney } from "@bloqer/services";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardMoneyBars } from "./dashboard-money-bars";

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

export function DashboardFinanceOverview({ finance }: { finance: DashboardFinanceSummary }) {
  const hasAr =
    finance.receivablesTotal != null ||
    finance.receivablesMulticurrency ||
    (finance.overdueReceivablesCount ?? 0) > 0 ||
    (finance.receivablesOpenByCurrency?.length ?? 0) > 0 ||
    (finance.receivablesDueSoonCount ?? 0) > 0;
  const hasAp =
    finance.payablesTotal != null ||
    finance.payablesMulticurrency ||
    (finance.overduePayablesCount ?? 0) > 0 ||
    (finance.payablesOpenByCurrency?.length ?? 0) > 0 ||
    (finance.payablesDueSoonCount ?? 0) > 0;
  const hasTr = Boolean(finance.cashByCurrency && Object.keys(finance.cashByCurrency).length > 0);

  const arRows =
    finance.receivablesOpenByCurrency?.map((r) => ({
      label: r.currency,
      raw: r.total,
      currency: r.currency,
    })) ?? [];
  const apRows =
    finance.payablesOpenByCurrency?.map((r) => ({
      label: r.currency,
      raw: r.total,
      currency: r.currency,
    })) ?? [];

  const cashRows = Object.entries(finance.cashByCurrency ?? {}).map(([cur, raw]) => ({
    label: cur,
    raw,
    currency: cur,
  }));

  return (
    <Card className="rounded-xl border bg-card shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">Finanzas y tesorería</CardTitle>
        <CardDescription>Posiciones abiertas por moneda (sin conversión cruzada).</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-2">
          {hasAr ? (
            <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
              <p className="text-sm font-medium">Cuentas por cobrar</p>
              {arRows.length > 0 ? (
                <DashboardMoneyBars title="Abierto por moneda" rows={arRows} />
              ) : (
                moneyLine(
                  "Total abierto",
                  finance.receivablesTotal ?? null,
                  finance.receivablesCurrency ?? null,
                  finance.receivablesMulticurrency,
                )
              )}
              {(finance.overdueReceivablesCount ?? 0) > 0 ? (
                <p className="text-xs text-destructive">Vencidas (líneas): {finance.overdueReceivablesCount}</p>
              ) : (
                <p className="text-xs text-muted-foreground">Sin líneas vencidas pendientes.</p>
              )}
              {(finance.receivablesDueSoonCount ?? 0) > 0 ? (
                <p className="text-xs text-muted-foreground">
                  Próximos vencimientos (14 días): {finance.receivablesDueSoonCount} línea(s)
                </p>
              ) : null}
            </div>
          ) : null}

          {hasAp ? (
            <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
              <p className="text-sm font-medium">Cuentas por pagar</p>
              {apRows.length > 0 ? (
                <DashboardMoneyBars title="Abierto por moneda" rows={apRows} />
              ) : (
                moneyLine(
                  "Total abierto",
                  finance.payablesTotal ?? null,
                  finance.payablesCurrency ?? null,
                  finance.payablesMulticurrency,
                )
              )}
              {(finance.overduePayablesCount ?? 0) > 0 ? (
                <p className="text-xs text-destructive">Vencidas (líneas): {finance.overduePayablesCount}</p>
              ) : (
                <p className="text-xs text-muted-foreground">Sin líneas vencidas pendientes.</p>
              )}
              {(finance.payablesDueSoonCount ?? 0) > 0 ? (
                <p className="text-xs text-muted-foreground">
                  Próximos vencimientos (14 días): {finance.payablesDueSoonCount} línea(s)
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        {hasTr ? (
          <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
            <p className="text-sm font-medium">Caja / bancos</p>
            {finance.cashMulticurrency ? <p className="text-xs text-muted-foreground">Varias monedas</p> : null}
            <DashboardMoneyBars title="Saldo por cuenta (moneda)" rows={cashRows} />
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {(hasAr || hasAp) && (
            <Button asChild variant="outline" size="sm">
              <Link href="/finanzas">Ver finanzas</Link>
            </Button>
          )}
          {hasTr && (
            <Button asChild variant="outline" size="sm">
              <Link href="/tesoreria">Ver tesorería</Link>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
