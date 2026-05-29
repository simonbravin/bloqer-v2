"use client";

import { useMemo } from "react";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { BudgetCompositionReport } from "@bloqer/services";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const COLORS = ["#2563eb", "#16a34a", "#ca8a04", "#9333ea"];

function moneyTooltip(value: number) {
  return value.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type Props = {
  composition: BudgetCompositionReport;
};

export function BudgetCompositionChart({ composition }: Props) {
  const chartData = useMemo(
    () =>
      composition.slices.map((s, i) => ({
        name: s.label,
        value: parseFloat(s.amount),
        percent: parseFloat(s.percent),
        fill: COLORS[i % COLORS.length],
      })),
    [composition.slices],
  );

  if (chartData.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Composición del presupuesto</CardTitle>
          <CardDescription>Costo directo por categoría APU</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground py-8 text-center">
          Sin líneas de análisis de costo en este presupuesto.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Composición del presupuesto</CardTitle>
        <CardDescription>
          Costo directo planificado · Total{" "}
          {moneyTooltip(parseFloat(composition.totalDirectCost))}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[260px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={52}
                outerRadius={88}
                paddingAngle={2}
              >
                {chartData.map((entry, index) => (
                  <Cell key={entry.name} fill={entry.fill ?? COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: number) => moneyTooltip(value)}
                labelFormatter={(label) => label}
              />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <ul className="mt-4 grid grid-cols-2 gap-2 text-xs">
          {composition.slices.map((s, i) => (
            <li key={s.category} className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: COLORS[i % COLORS.length] }}
              />
              <span className="text-muted-foreground">{s.label}</span>
              <span className="ml-auto font-mono">{s.percent}%</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
