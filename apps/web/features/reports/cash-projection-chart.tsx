"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { CashProjectionBucket } from "@bloqer/services";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CHART_SERIES } from "@/lib/chart-series-colors";
import { formatChartAxis, formatChartMoney } from "@/lib/format-money";
import { REPORT_CHART_FRAME_CLASS, REPORT_CHART_Y_AXIS_WIDTH } from "./report-layout";

type Props = {
  buckets: CashProjectionBucket[];
  currency: string;
};

export function CashProjectionChart({ buckets, currency }: Props) {
  const data = useMemo(
    () =>
      buckets.map((b) => ({
        name: b.periodLabel,
        Cobros: parseFloat(b.expectedInflows),
        Pagos: parseFloat(b.expectedOutflows),
        Neto: parseFloat(b.netExpected),
      })),
    [buckets],
  );

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Proyección de caja (R-006)</CardTitle>
          <CardDescription>AR/AP pendientes por vencimiento · {currency}</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground py-8 text-center">
          Sin saldos pendientes en el horizonte seleccionado.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Proyección de caja (R-006)</CardTitle>
        <CardDescription>
          Cobros y pagos esperados por vencimiento · {currency} · solo liquidez documentada (sin OC abiertas)
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className={REPORT_CHART_FRAME_CLASS}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={formatChartAxis} width={REPORT_CHART_Y_AXIS_WIDTH} />
              <Tooltip formatter={(v) => formatChartMoney(Number(v), currency)} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Cobros" fill={CHART_SERIES.collected} radius={[2, 2, 0, 0]} />
              <Bar dataKey="Pagos" fill={CHART_SERIES.costPaid} radius={[2, 2, 0, 0]} />
              <Bar dataKey="Neto" fill={CHART_SERIES.margin} radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
