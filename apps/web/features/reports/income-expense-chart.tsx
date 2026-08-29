"use client";

import { useMemo } from "react";
import {
  Bar,
  CartesianGrid,
  Legend,
  Line,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { IncomeExpensePoint } from "@bloqer/services";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatChartAxis, formatChartMoney } from "@/lib/format-money";
import { REPORT_CHART_FRAME_CLASS, REPORT_CHART_Y_AXIS_WIDTH } from "./report-layout";

type Props = {
  series: IncomeExpensePoint[];
  /** composed = barras + líneas de caja; trend = solo líneas de tendencia económica */
  variant?: "composed" | "trend";
  title?: string;
  description?: string;
  /** Skip the outer card when the chart already sits in a panel. */
  embedded?: boolean;
};

export function IncomeExpenseChart({
  series,
  variant = "composed",
  title,
  description,
  embedded = false,
}: Props) {
  const data = useMemo(
    () =>
      series.map((p) => ({
        name: p.periodLabel,
        Certificado: parseFloat(p.certifiedAmount),
        "Costo devengado": parseFloat(p.costAccrued),
        Cobrado: parseFloat(p.collectedAmount),
        "Costo pagado": parseFloat(p.costPaid),
        "MB devengado": parseFloat(p.grossMarginAccrued),
        "MB caja": parseFloat(p.grossMarginCash),
      })),
    [series],
  );

  const fewPoints = data.length <= 3;
  const frameClass = embedded
    ? "h-[260px] w-full min-w-0 overflow-x-auto sm:h-[320px]"
    : `${REPORT_CHART_FRAME_CLASS} overflow-x-auto`;

  const empty = (
    <p className="py-8 text-center text-sm text-muted-foreground">Sin datos en el rango seleccionado.</p>
  );

  const plot =
    data.length === 0 ? (
      empty
    ) : variant === "trend" ? (
      <div className={frameClass}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 10 }}
              interval={fewPoints ? 0 : "preserveStartEnd"}
              angle={fewPoints ? 0 : -20}
              textAnchor={fewPoints ? "middle" : "end"}
              height={fewPoints ? 28 : 48}
            />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={formatChartAxis} width={REPORT_CHART_Y_AXIS_WIDTH} />
            <Tooltip formatter={(v) => formatChartMoney(Number(v))} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line
              type="monotone"
              dataKey="Certificado"
              stroke="hsl(var(--chart-1))"
              strokeWidth={2.5}
              dot={{ r: 3 }}
            />
            <Line
              type="monotone"
              dataKey="Costo devengado"
              stroke="hsl(var(--chart-4))"
              strokeWidth={2}
              dot={{ r: 2 }}
            />
            <Line
              type="monotone"
              dataKey="MB devengado"
              stroke="hsl(var(--chart-2))"
              strokeWidth={2}
              strokeDasharray="4 4"
              dot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    ) : (
      <div className={frameClass}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 10 }}
              interval={fewPoints ? 0 : "preserveStartEnd"}
              angle={fewPoints ? 0 : -20}
              textAnchor={fewPoints ? "middle" : "end"}
              height={fewPoints ? 28 : 48}
            />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={formatChartAxis} width={REPORT_CHART_Y_AXIS_WIDTH} />
            <Tooltip formatter={(v) => formatChartMoney(Number(v))} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="Certificado" fill="hsl(var(--chart-1))" radius={[2, 2, 0, 0]} />
            <Bar dataKey="Costo devengado" fill="hsl(var(--chart-4))" radius={[2, 2, 0, 0]} />
            <Line type="monotone" dataKey="Cobrado" stroke="hsl(var(--chart-2))" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="Costo pagado" stroke="hsl(var(--chart-5))" strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    );

  if (embedded) return plot;

  const heading = variant === "trend" ? (title ?? "Tendencia mensual") : (title ?? "Ingresos vs gastos");
  const sub =
    description ??
    (variant === "trend"
      ? "Certificado, costo devengado y margen bruto por mes"
      : "Barras: certificado vs costo devengado · Línea: cobrado vs pagado · MB = margen del período");

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{heading}</CardTitle>
        <CardDescription>{sub}</CardDescription>
      </CardHeader>
      <CardContent>{plot}</CardContent>
    </Card>
  );
}
