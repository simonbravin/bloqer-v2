"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { FinanceHubCharts } from "@bloqer/services";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CashFlowChart } from "@/features/treasury-reports/components/cash-flow-chart";
import { IncomeExpenseChart } from "@/features/reports/income-expense-chart";
import {
  MonthlyTrendRangeToggle,
  readTrendMonthsParam,
} from "@/features/finance/components/monthly-trend-range-toggle";
import { cn } from "@/lib/utils";

type Props = {
  charts: FinanceHubCharts;
  defaultTab: "caja" | "economico";
};

export function FinanceHubChartsPanel({ charts, defaultTab }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab =
    searchParams.get("trend") === "economico"
      ? "economico"
      : searchParams.get("trend") === "caja"
        ? "caja"
        : defaultTab;
  const months = readTrendMonthsParam(searchParams.get("months"), charts.months);

  function setParams(next: { trend?: string; months?: number }) {
    const p = new URLSearchParams(searchParams.toString());
    if (next.trend) p.set("trend", next.trend);
    if (next.months != null) p.set("months", String(next.months));
    router.replace(`/finanzas?${p.toString()}`, { scroll: false });
  }

  const hasCash = charts.cash != null && charts.cash.buckets.length > 0;
  const hasEconomic = charts.economic != null && charts.economic.series.length > 0;
  const canEconomic = charts.economic != null;
  const canCash = charts.cash != null;

  return (
    <Card className="rounded-xl border bg-card shadow-sm">
      <CardHeader className="border-b border-border/60 pb-4">
        <div className="flex flex-col gap-3 sm:gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-1">
            <CardTitle className="text-base">Tendencia mensual</CardTitle>
            <CardDescription>
              {tab === "economico"
                ? "Ingresos vs gastos por mes"
                : "Entradas y salidas de tesorería por mes"}
            </CardDescription>
          </div>
          <div className="flex min-w-0 flex-col items-stretch gap-2 sm:items-end">
            <div className="inline-flex flex-wrap rounded-lg border border-border/80 bg-muted/30 p-0.5" role="group" aria-label="Capa del gráfico">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className={cn(
                  "h-8 rounded-md px-3 text-xs font-medium",
                  tab === "economico" && "bg-background text-foreground shadow-sm",
                )}
                aria-pressed={tab === "economico"}
                onClick={() => setParams({ trend: "economico" })}
                disabled={!canEconomic}
              >
                Económico
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className={cn(
                  "h-8 rounded-md px-3 text-xs font-medium",
                  tab === "caja" && "bg-background text-foreground shadow-sm",
                )}
                aria-pressed={tab === "caja"}
                onClick={() => setParams({ trend: "caja" })}
                disabled={!canCash}
              >
                Caja
              </Button>
            </div>
            <MonthlyTrendRangeToggle months={months} onChange={(next) => setParams({ months: next })} />
          </div>
        </div>
      </CardHeader>
      <CardContent className="min-w-0 pt-4">
        {charts.cashMulticurrency && tab === "caja" ? (
          <p className="mb-3 text-xs text-muted-foreground">
            Multimoneda: el gráfico muestra {charts.cash?.currency ?? "una moneda"}. Ver reporte completo para el resto.
          </p>
        ) : null}
        {tab === "caja" ? (
          charts.cash && hasCash ? (
            <CashFlowChart data={charts.cash} variant="bars" className="h-[260px] w-full min-w-0 sm:h-[320px]" />
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Sin movimientos de tesorería en el rango.{" "}
              <Link href="/tesoreria/flujo-caja" className="underline underline-offset-2">
                Ver flujo de caja
              </Link>
            </p>
          )
        ) : charts.economic && hasEconomic ? (
          <div className="min-w-0 space-y-3">
            {charts.economic.consolidationNote ? (
              <p className="text-xs text-amber-800 dark:text-amber-200">{charts.economic.consolidationNote}</p>
            ) : null}
            <IncomeExpenseChart series={charts.economic.series} embedded />
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Sin datos económicos consolidados en el rango seleccionado.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
