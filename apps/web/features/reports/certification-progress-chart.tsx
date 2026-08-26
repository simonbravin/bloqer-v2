"use client";

import { useMemo } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { CertificationProgressPoint } from "@bloqer/services";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRatePctFromString } from "@/lib/format-money";
import { REPORT_CHART_FRAME_CLASS, REPORT_CHART_Y_AXIS_WIDTH } from "./report-layout";

type Props = {
  series: CertificationProgressPoint[];
};

export function CertificationProgressChart({ series }: Props) {
  const data = useMemo(
    () =>
      series.map((p) => ({
        name: p.periodLabel,
        "Avance económico %": parseFloat(p.economicPct),
        "Avance financiero %": parseFloat(p.financialPct),
        "Avance físico %": parseFloat(p.physicalPct),
      })),
    [series],
  );

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Curvas de avance</CardTitle>
          <CardDescription>Acumulado sobre venta presupuestada</CardDescription>
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
        <CardTitle className="text-base">Curvas de avance</CardTitle>
        <CardDescription>% acumulado sobre venta total del presupuesto</CardDescription>
      </CardHeader>
      <CardContent>
        <div className={REPORT_CHART_FRAME_CLASS}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} tickLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11 }} unit="%" domain={[0, "auto"]} tickLine={false} width={REPORT_CHART_Y_AXIS_WIDTH} />
              <Tooltip formatter={(v: number) => `${formatRatePctFromString(String(v))}%`} />
              <Legend />
              <Line type="monotone" dataKey="Avance económico %" stroke="#2563eb" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Avance financiero %" stroke="#16a34a" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Avance físico %" stroke="#9333ea" strokeWidth={2} dot={false} strokeDasharray="4 4" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
