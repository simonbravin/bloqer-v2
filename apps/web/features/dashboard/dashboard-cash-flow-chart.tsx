"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { CashFlowCurrency, DashboardCashFlowChart, DashboardCashFlowRange } from "@bloqer/services";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CashFlowChart } from "@/features/treasury-reports/components/cash-flow-chart";
import { formatCurrencyDisplay } from "@/lib/format";
import { cn } from "@/lib/utils";

const RANGE_OPTIONS: { id: DashboardCashFlowRange; label: string }[] = [
  { id: "month", label: "Este mes" },
  { id: "3m", label: "Últimos 3 meses" },
  { id: "6m", label: "6 meses" },
  { id: "1y", label: "Último año" },
];

function pickPrimarySeries(report: CashFlowCurrency[]): CashFlowCurrency | null {
  if (report.length === 0) return null;
  return report.find((r) => r.currency === "ARS") ?? report[0] ?? null;
}

export function DashboardCashFlowChart({ chart }: { chart: DashboardCashFlowChart }) {
  const available = RANGE_OPTIONS.filter((o) => chart.byRange[o.id]?.length);
  const defaultRange = available[0]?.id ?? "month";
  const [range, setRange] = useState<DashboardCashFlowRange>(defaultRange);

  const report = chart.byRange[range] ?? [];
  const primary = useMemo(() => pickPrimarySeries(report), [report]);

  if (available.length === 0) return null;

  return (
    <Card className="rounded-xl border border-border bg-card shadow-sm">
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <CardTitle className="text-base">Flujo de caja</CardTitle>
        </div>
        <div
          className="inline-flex flex-wrap rounded-lg border border-border/80 bg-muted/30 p-0.5"
          role="group"
          aria-label="Período del gráfico"
        >
          {available.map((opt) => (
            <Button
              key={opt.id}
              type="button"
              size="sm"
              variant="ghost"
              className={cn(
                "h-8 rounded-md px-3 text-xs font-medium",
                range === opt.id && "bg-background text-foreground shadow-sm",
              )}
              aria-pressed={range === opt.id}
              onClick={() => setRange(opt.id)}
            >
              {opt.label}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {primary && primary.buckets.length > 0 ? (
          <CashFlowChart data={primary} variant="trend" />
        ) : (
          <p className="rounded-lg border border-dashed shell-surface-inset px-4 py-10 text-center text-sm text-muted-foreground">
            No hay movimientos en el período seleccionado.
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          {primary ? <span>Moneda: {formatCurrencyDisplay(primary.currency)}</span> : <span />}
          <Link href={chart.detailHref} className="text-primary underline-offset-4 hover:underline">
            Ver reporte completo
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
