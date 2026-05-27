import Link from "next/link";
import type { CompanyFinanceOperationsSummary, FinanceHubOverview } from "@bloqer/services";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardKpiCard } from "@/features/dashboard/dashboard-kpi-card";
import { KpiStatGrid } from "@/components/ui/kpi-stat-grid";
import { Inbox } from "lucide-react";

function formatMoney(raw: string, currency: string): string {
  const n = Number(raw);
  if (Number.isNaN(n)) return raw;
  try {
    return new Intl.NumberFormat("es-AR", {
      style:                 "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${raw} ${currency}`;
  }
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-muted/15 px-6 py-10 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Inbox className="h-6 w-6" aria-hidden />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}

function CompanyOperationsSection({ summary }: { summary: CompanyFinanceOperationsSummary }) {
  if (!summary.visible) return null;
  return (
    <Card className="rounded-xl border bg-card shadow-sm">
      <CardHeader className="border-b border-border/60 pb-4">
        <CardTitle className="text-base">Gastos generales (empresa)</CardTitle>
        <CardDescription>Últimos pagos corporativos sin proyecto.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        {summary.loadFailed ? (
          <p className="text-sm text-destructive">No se pudo cargar el detalle.</p>
        ) : summary.recentCorporatePayments.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin pagos corporativos recientes.</p>
        ) : (
          <ul className="divide-y divide-border/60 text-sm">
            {summary.recentCorporatePayments.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div>
                  <Link
                    href={`/finanzas/pagos-proveedor/${p.id}`}
                    className="font-medium text-primary underline-offset-4 hover:underline"
                  >
                    {p.supplierLabel}
                  </Link>
                  <p className="text-xs text-muted-foreground">{p.paymentDate}</p>
                </div>
                <span className="tabular-nums font-medium">{formatMoney(p.amount, p.currency)}</span>
              </li>
            ))}
          </ul>
        )}
        <Button asChild size="sm" variant="outline">
          <Link href="/finanzas/gastos-generales">Abrir asistente</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export function FinanceHubView({ overview }: { overview: FinanceHubOverview }) {
  if (!overview.hasFinanceModules) {
    return (
      <EmptyState
        title="Finanzas no habilitadas"
        body="Los módulos de cuentas por cobrar, cuentas por pagar, tesorería o contabilidad no están activos para este tenant."
      />
    );
  }

  if (!overview.canSeeAnything) {
    return (
      <EmptyState
        title="Sin acceso al tablero"
        body="Necesitás permiso VIEW AR, VIEW AP, VIEW TREASURY o VIEW ACCOUNTING con el módulo habilitado."
      />
    );
  }

  return (
    <div className="space-y-8">
      {overview.alerts.length > 0 ? (
        <div className="space-y-2">
          {overview.alerts.map((a, i) => (
            <div
              key={i}
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

      {overview.hubKpis.length > 0 ? (
        <KpiStatGrid title="Indicadores" columns={4}>
          {overview.hubKpis.map((k) => (
            <DashboardKpiCard key={k.key} kpi={k} />
          ))}
        </KpiStatGrid>
      ) : null}

      {overview.hubShortcuts.length > 0 ? (
        <Card className="rounded-xl border bg-card shadow-sm">
          <CardHeader className="border-b border-border/60 pb-4">
            <CardTitle className="text-base">Accesos rápidos</CardTitle>
            <CardDescription>Enlaces según tus permisos y módulos activos.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 pt-4 sm:grid-cols-2 lg:grid-cols-3">
            {overview.hubShortcuts.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-lg border bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
              >
                <p className="font-semibold hover:underline">{item.label}</p>
                {item.description ? (
                  <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
                ) : null}
              </Link>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {overview.companyOperations ? (
        <CompanyOperationsSection summary={overview.companyOperations} />
      ) : null}
    </div>
  );
}
