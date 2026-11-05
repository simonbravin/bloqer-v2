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
import type { CertificationEvolutionPoint } from "@bloqer/services";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CHART_SERIES } from "@/lib/chart-series-colors";
import { formatChartAxis, formatChartMoney } from "@/lib/format-money";
import { REPORT_CHART_FRAME_CLASS, REPORT_CHART_Y_AXIS_WIDTH } from "./report-layout";

type Props = {
  series: CertificationEvolutionPoint[];
  currency: string;
  arAvailable: boolean;
};

export function CertificationEvolutionChart({ series, currency, arAvailable }: Props) {
  const description = arAvailable
    ? "Certificado (fin del período) · Facturado (emisión) · Cobrado (cobranza)"
    : "Certificado (fin del período)";
  const data = useMemo(
    () =>
      series.map((p) => ({
        name: p.periodLabel,
        Certificado: parseFloat(p.certifiedAmount),
        Facturado: p.invoicedAmount === null ? null : Number(p.invoicedAmount),
        Cobrado: p.collectedAmount === null ? null : Number(p.collectedAmount),
      })),
    [series],
  );

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Evolución mensual</CardTitle>
          <CardDescription>{description} · {currency}</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground py-8 text-center">
          Sin datos en el rango seleccionado.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Evolución mensual</CardTitle>
        <CardDescription>{description} · {currency}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className={REPORT_CHART_FRAME_CLASS}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} tickLine={false} interval="preserveStartEnd" />
              <YAxis
                tick={{ fontSize: 11 }}
                tickFormatter={formatChartAxis}
                tickLine={false}
                width={REPORT_CHART_Y_AXIS_WIDTH}
              />
              <Tooltip formatter={(v) => formatChartMoney(Number(v), currency)} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Certificado" fill={CHART_SERIES.certified} radius={[2, 2, 0, 0]} />
              {arAvailable && <Bar dataKey="Facturado" fill={CHART_SERIES.invoiced} radius={[2, 2, 0, 0]} />}
              {arAvailable && <Bar dataKey="Cobrado" fill={CHART_SERIES.collected} radius={[2, 2, 0, 0]} />}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
