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
import type { SubcontractCertEvolutionPoint } from "@bloqer/services";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

function fmt(v: number) {
  return v.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type Props = {
  series: SubcontractCertEvolutionPoint[];
};

export function SubcontractCertChart({ series }: Props) {
  const data = useMemo(
    () =>
      series.map((p) => ({
        name: p.periodLabel,
        Certificado: parseFloat(p.certifiedAmount),
        Pagado: parseFloat(p.paidAmount),
      })),
    [series],
  );

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Certificado vs pagado</CardTitle>
          <CardDescription>Evolución mensual de subcontratos</CardDescription>
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
        <CardTitle className="text-base">Certificado vs pagado</CardTitle>
        <CardDescription>Montos mensuales de certificaciones y pagos a subcontratos</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => fmt(v)} width={72} />
              <Tooltip formatter={(v: number) => fmt(v)} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Certificado" fill="hsl(var(--chart-1))" radius={[2, 2, 0, 0]} />
              <Bar dataKey="Pagado" fill="hsl(var(--chart-2))" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
