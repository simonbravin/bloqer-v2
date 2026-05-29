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

function fmt(v: number) {
  return v.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

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
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => fmt(v)} width={72} />
              <Tooltip formatter={(v: number) => `${fmt(v)} ${currency}`} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Cobros" fill="hsl(var(--chart-2))" radius={[2, 2, 0, 0]} />
              <Bar dataKey="Pagos" fill="hsl(var(--chart-4))" radius={[2, 2, 0, 0]} />
              <Bar dataKey="Neto" fill="hsl(var(--chart-1))" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
