"use client";

import { useMemo } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { BudgetCompositionReport } from "@bloqer/services";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { costCategoryColor } from "@/lib/cost-category-colors";
import { formatChartMoney } from "@/lib/format-money";

function moneyTooltip(value: number) {
  return formatChartMoney(value);
}

type Props = {
  composition: BudgetCompositionReport;
};

export function BudgetCompositionChart({ composition }: Props) {
  const chartData = useMemo(
    () =>
      composition.slices.map((s, i) => ({
        name: s.label,
        category: s.category,
        value: parseFloat(s.amount),
        percent: parseFloat(s.percent),
        fill: costCategoryColor(s.category, i),
      })),
    [composition.slices],
  );

  if (chartData.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Composición del presupuesto</CardTitle>
          <CardDescription>Costo directo planificado por tipo (APU)</CardDescription>
        </CardHeader>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
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
          Costo directo planificado · Total {formatChartMoney(composition.totalDirectCost)}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-4 md:flex-row md:items-center">
          <div className="h-[200px] w-full min-w-0 sm:h-[240px] md:flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={48}
                  outerRadius={80}
                  paddingAngle={2}
                >
                  {chartData.map((entry, index) => (
                    <Cell
                      key={entry.category}
                      fill={entry.fill ?? costCategoryColor(entry.category, index)}
                    />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number) => moneyTooltip(value)}
                  labelFormatter={(label) => label}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs md:w-56 md:shrink-0 md:grid-cols-1">
            {composition.slices.map((s, i) => (
              <li key={s.category} className="flex items-center gap-2 min-w-0">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: costCategoryColor(s.category, i) }}
                />
                <span className="truncate text-muted-foreground">{s.label}</span>
                <span className="ml-auto shrink-0 font-mono tabular-nums">{s.percent}%</span>
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
