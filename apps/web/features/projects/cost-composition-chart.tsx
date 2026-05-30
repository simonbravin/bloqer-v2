"use client";

import { useMemo } from "react";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { ProjectCostCompositionReport } from "@bloqer/services";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const COLORS = ["#2563eb", "#16a34a", "#ca8a04", "#9333ea"];

function moneyTooltip(value: number) {
  return value.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type Props = {
  composition: ProjectCostCompositionReport;
};

export function CostCompositionChart({ composition }: Props) {
  const chartData = useMemo(
    () =>
      composition.slices.map((s, i) => ({
        name: s.label,
        value: parseFloat(s.amount),
        fill: COLORS[i % COLORS.length],
      })),
    [composition.slices],
  );

  if (chartData.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Composición de gastos</CardTitle>
          <CardDescription>Costo devengado por rubro APU</CardDescription>
        </CardHeader>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Sin costo devengado imputado por rubro en este presupuesto.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Composición de gastos</CardTitle>
        <CardDescription>
          Costo devengado · Total {moneyTooltip(parseFloat(composition.totalAccruedCost))}
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
              <Tooltip formatter={(value: number) => moneyTooltip(value)} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
