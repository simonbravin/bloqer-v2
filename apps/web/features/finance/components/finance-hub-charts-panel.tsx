"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { FinanceHubCharts } from "@bloqer/services";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CashFlowChart } from "@/features/treasury-reports/components/cash-flow-chart";
import { IncomeExpenseChart } from "@/features/reports/income-expense-chart";
import { DashboardKpiCard } from "@/features/dashboard/dashboard-kpi-card";

type Props = {
  charts: FinanceHubCharts;
  defaultTab: "caja" | "economico";
};

export function FinanceHubChartsPanel({ charts, defaultTab }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = searchParams.get("trend") === "economico"
    ? "economico"
    : searchParams.get("trend") === "caja"
      ? "caja"
      : defaultTab;
  const months = charts.months;

  function setParams(next: { trend?: string; months?: number }) {
    const p = new URLSearchParams(searchParams.toString());
    if (next.trend) p.set("trend", next.trend);
    if (next.months) p.set("months", String(next.months));
    router.replace(`/finanzas?${p.toString()}`, { scroll: false });
  }
  const hasCash = charts.cash != null && charts.cash.buckets.length > 0;
  const hasEconomic = charts.economic != null && charts.economic.series.length > 0;

  if (!hasCash && !hasEconomic) return null;

  return (
    <div className="space-y-4">
      {charts.currentMonthNetCash && tab === "caja" ? (
        <DashboardKpiCard
          kpi={{
            key: "monthly_net_cash",
            label: "Flujo neto del mes",
            value: charts.currentMonthNetCash.label,
            href: "/tesoreria/reportes/flujo-caja",
            helper: `Neto operativo (${charts.currentMonthNetCash.periodKey})`,
          }}
        />
      ) : null}

      <Card className="rounded-xl border bg-card shadow-sm">
        <CardHeader className="border-b border-border/60 pb-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-base">Tendencia mensual</CardTitle>
              <CardDescription>
                {tab === "caja"
                  ? "Ingresos y egresos de tesorería (R-005). Solo movimientos de caja confirmados."
                  : "Certificado vs costo devengado consolidado por tenant (obras + gastos corporativos)."}
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant={tab === "caja" ? "secondary" : "outline"}
                onClick={() => setParams({ trend: "caja" })}
                disabled={!hasCash && !charts.cash}
              >
                Caja
              </Button>
              <Button
                type="button"
                size="sm"
                variant={tab === "economico" ? "secondary" : "outline"}
                onClick={() => setParams({ trend: "economico" })}
                disabled={!charts.economic}
              >
                Económico
              </Button>
              <span className="mx-1 hidden h-4 w-px bg-border sm:inline" aria-hidden />
              <Button
                type="button"
                size="sm"
                variant={months === 6 ? "secondary" : "outline"}
                onClick={() => setParams({ months: 6 })}
              >
                6 meses
              </Button>
              <Button
                type="button"
                size="sm"
                variant={months === 12 ? "secondary" : "outline"}
                onClick={() => setParams({ months: 12 })}
              >
                12 meses
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          {charts.cashMulticurrency && tab === "caja" ? (
            <p className="mb-3 text-xs text-muted-foreground">
              Multimoneda: el gráfico muestra {charts.cash?.currency ?? "una moneda"}. Ver reporte completo para el resto.
            </p>
          ) : null}
          {tab === "caja" ? (
            charts.cash && hasCash ? (
              <CashFlowChart data={charts.cash} variant="bars" />
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Sin movimientos de tesorería en el rango.{" "}
                <Link href="/tesoreria/reportes/flujo-caja" className="underline underline-offset-2">
                  Ver flujo de caja
                </Link>
              </p>
            )
          ) : charts.economic && hasEconomic ? (
            <div className="space-y-3">
              {charts.economic.consolidationNote ? (
                <p className="text-xs text-amber-800 dark:text-amber-200">{charts.economic.consolidationNote}</p>
              ) : null}
              <IncomeExpenseChart series={charts.economic.series} />
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Sin datos económicos consolidados en el rango seleccionado.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
