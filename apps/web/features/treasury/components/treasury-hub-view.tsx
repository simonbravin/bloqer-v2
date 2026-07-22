"use client";

import Link from "next/link";
import type { TreasuryHubOverview, TreasuryMoneyByCurrency } from "@bloqer/services";
import { formatDashboardMoney } from "@bloqer/services/dashboard-format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiStatCard, type KpiStatTone } from "@/components/ui/kpi-stat-card";
import { KpiStatGrid } from "@/components/ui/kpi-stat-grid";
import { ListEmptyState } from "@/components/ui/list-empty-state";
import { formatDate } from "@/lib/format";

function moneyTone(raw: string): KpiStatTone {
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n) || n === 0) return "muted";
  return n > 0 ? "success" : "danger";
}

function formatMoneyBucket(rows: TreasuryMoneyByCurrency[], empty = "$ 0,00"): {
  value: string;
  helper?: string;
  tone: KpiStatTone;
} {
  if (rows.length === 0) return { value: empty, tone: "muted" };
  if (rows.length === 1) {
    const only = rows[0]!;
    return {
      value: formatDashboardMoney(only.amount, only.currency),
      tone: moneyTone(only.amount),
    };
  }
  return {
    value: "Multimoneda",
    helper: rows.map((r) => r.currency).join(" · "),
    tone: "muted",
  };
}

function isOutflowType(type: string): boolean {
  return type !== "INFLOW" && type !== "TRANSFER_IN";
}

function signedAmount(type: string, amount: string, currency: string): string {
  const formatted = formatDashboardMoney(amount, currency);
  return isOutflowType(type) ? `− ${formatted}` : `+ ${formatted}`;
}

export function TreasuryHubView({
  overview,
  canCreateAccount,
}: {
  overview: TreasuryHubOverview;
  canCreateAccount: boolean;
}) {
  const hasAccounts = overview.accounts.length > 0;
  const balanceKpi = formatMoneyBucket(overview.balanceByCurrency, "—");
  const inflowKpi = formatMoneyBucket(overview.monthlyInflowByCurrency);
  const outflowKpi = formatMoneyBucket(overview.monthlyOutflowByCurrency);

  const accountCount = overview.accounts.length;
  const currencies = [...new Set(overview.accounts.map((a) => a.currency))].sort();
  const accountsHelper =
    currencies.length > 0 ? currencies.join(" · ") : undefined;

  if (!hasAccounts) {
    return (
      <div className="space-y-4">
        <ListEmptyState message="Todavía no hay cuentas de tesorería. Creá una caja o banco para empezar." />
        {canCreateAccount ? (
          <Button asChild>
            <Link href="/tesoreria/cuentas/nueva">Nueva cuenta</Link>
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <KpiStatGrid title={null} columns={4}>
        <KpiStatCard
          iconKey="treasury_balance"
          label="Saldo en cuentas"
          value={balanceKpi.value}
          helper={balanceKpi.helper}
          href="/tesoreria/cuentas"
          tone={balanceKpi.tone}
          variant="highlight"
        />
        <KpiStatCard
          iconKey="treasury_accounts"
          label="Cuentas activas"
          value={String(accountCount)}
          helper={accountsHelper}
          href="/tesoreria/cuentas"
          tone={accountCount > 0 ? "default" : "muted"}
        />
        <KpiStatCard
          iconKey="ar_open"
          label="Ingresos del mes"
          value={inflowKpi.value}
          helper={inflowKpi.helper}
          href="/tesoreria/reportes/flujo-caja"
          tone={inflowKpi.tone === "muted" ? "muted" : "success"}
        />
        <KpiStatCard
          iconKey="treasury_monthly_expenses"
          label="Egresos del mes"
          value={outflowKpi.value}
          helper={outflowKpi.helper}
          href="/tesoreria/reportes/flujo-caja"
          tone={outflowKpi.tone === "muted" ? "muted" : "default"}
        />
      </KpiStatGrid>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="rounded-xl border bg-card shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Cuentas</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {overview.accounts.map((a) => (
                <li key={a.accountId} className="flex items-baseline justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                  <Link
                    href={`/tesoreria/cuentas/${a.accountId}`}
                    className="min-w-0 truncate text-sm font-medium hover:underline"
                  >
                    {a.name}
                    <span className="ml-1.5 text-xs font-normal text-muted-foreground">{a.currency}</span>
                  </Link>
                  <span className="shrink-0 tabular-nums text-sm text-muted-foreground">
                    {formatDashboardMoney(a.balance, a.currency)}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
          <CardFooter>
            <Button asChild variant="outline" size="sm">
              <Link href="/tesoreria/cuentas">Ver todas</Link>
            </Button>
          </CardFooter>
        </Card>

        <Card className="rounded-xl border bg-card shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Últimos movimientos</CardTitle>
          </CardHeader>
          <CardContent>
            {overview.recentMovements.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin movimientos recientes.</p>
            ) : (
              <ul className="divide-y">
                {overview.recentMovements.map((m) => (
                  <li key={m.id} className="py-2.5 first:pt-0 last:pb-0">
                    <Link href={m.href} className="group flex items-baseline justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium group-hover:underline">
                          {m.description || m.accountName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(m.movementDate)}
                          {m.description ? ` · ${m.accountName}` : null}
                        </p>
                      </div>
                      <span
                        className={
                          isOutflowType(m.type)
                            ? "shrink-0 tabular-nums text-sm text-muted-foreground"
                            : "shrink-0 tabular-nums text-sm font-medium"
                        }
                      >
                        {signedAmount(m.type, m.amount, m.currency)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
          <CardFooter>
            <Button asChild variant="outline" size="sm">
              <Link href="/tesoreria/reportes/movimientos">Ver movimientos</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
