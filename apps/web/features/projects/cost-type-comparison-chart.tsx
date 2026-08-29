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
import type { CostTypeComparisonReport } from "@bloqer/services";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { costCategoryColor } from "@/lib/cost-category-colors";
import { formatChartMoney } from "@/lib/format-money";

type Props = {
  comparison: CostTypeComparisonReport;
};

/**
 * Grouped horizontal bars per CostCategory, showing planned budget vs accrued
 * cost vs expected exposure ([D-099]). Complements the APU composition pie.
 */
export function CostTypeComparisonChart({ comparison }: Props) {
  const chartData = useMemo(
    () =>
      comparison.rows.map((r) => ({
        name: r.label,
        Presupuesto: Number(r.budgetTotalCost),
        Devengado: Number(r.accruedCost),
        Exposición: Number(r.expectedCostExposure),
      })),
    [comparison.rows],
  );

  if (chartData.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Gasto por tipo</CardTitle>
          <CardDescription>Presupuesto vs devengado vs exposición esperada</CardDescription>
        </CardHeader>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Todavía no hay gasto tipado ni presupuesto tipado en este proyecto.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Gasto por tipo</CardTitle>
        <CardDescription>Presupuesto vs devengado vs exposición esperada</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[240px] w-full min-w-0 sm:h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 8, right: 16, left: 12, bottom: 8 }}
              barCategoryGap={12}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-muted" />
              <XAxis
                type="number"
                tickFormatter={(v: number) => formatChartMoney(v)}
                tick={{ fontSize: 10 }}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={100}
                tick={{ fontSize: 11 }}
              />
              <Tooltip formatter={(v: number) => formatChartMoney(v)} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="Presupuesto" fill="#94a3b8" radius={[0, 2, 2, 0]} />
              <Bar dataKey="Devengado" fill="#16a34a" radius={[0, 2, 2, 0]} />
              <Bar dataKey="Exposición" fill="#dc2626" radius={[0, 2, 2, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-1.5 text-[10px] text-muted-foreground sm:grid-cols-3">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: "#94a3b8" }} />
            <span>Presupuesto: costo directo planificado por tipo (APU).</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: "#16a34a" }} />
            <span>Devengado: facturas emitidas + certificaciones aprobadas.</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: "#dc2626" }} />
            <span>Exposición: devengado + comprometido abierto (sin doble conteo).</span>
          </div>
        </div>
        <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] sm:grid-cols-3 md:grid-cols-5">
          {comparison.rows.map((r) => (
            <li key={r.category} className="flex items-center gap-1.5 truncate">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: costCategoryColor(r.category) }}
              />
              <span className="truncate text-muted-foreground">{r.label}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
