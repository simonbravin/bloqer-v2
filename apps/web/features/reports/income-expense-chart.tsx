"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
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

function fmt(v: number) {
  return v.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

type Props = {
  series: IncomeExpensePoint[];
};

export function IncomeExpenseChart({ series }: Props) {
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

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Ingresos vs gastos</CardTitle>
          <CardDescription>Evolución mensual por capa</CardDescription>
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
        <CardTitle className="text-base">Ingresos vs gastos</CardTitle>
        <CardDescription>
          Barras: certificado vs costo devengado · Línea: cobrado vs pagado · MB = margen del período
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={56} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => fmt(v)} width={64} />
              <Tooltip formatter={(v: number) => fmt(v)} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="Certificado" fill="hsl(var(--chart-1))" radius={[2, 2, 0, 0]} />
              <Bar dataKey="Costo devengado" fill="hsl(var(--chart-4))" radius={[2, 2, 0, 0]} />
              <Line type="monotone" dataKey="Cobrado" stroke="hsl(var(--chart-2))" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Costo pagado" stroke="hsl(var(--chart-5))" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
