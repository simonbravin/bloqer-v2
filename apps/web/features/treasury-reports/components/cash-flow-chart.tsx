"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { CashFlowCurrency } from "@bloqer/services";

interface Props {
  data: CashFlowCurrency;
}

export function CashFlowChart({ data }: Props) {
  if (data.buckets.length === 0) return null;

  const chartData = data.buckets.map((b) => ({
    period:               b.period,
    ingresos:             parseFloat(b.inflow),
    egresos:              parseFloat(b.outflow),
    netOperativo:         parseFloat(b.netOperatingCashFlow),
  }));

  function fmtAxis(v: number) {
    if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (Math.abs(v) >= 1_000)     return `${(v / 1_000).toFixed(0)}k`;
    return v.toLocaleString("es-AR", { maximumFractionDigits: 0 });
  }

  function fmtTooltip(v: number) {
    return v.toLocaleString("es-AR", { minimumFractionDigits: 2 });
  }

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis
            dataKey="period"
            tick={{ fontSize: 11 }}
            className="text-muted-foreground"
          />
          <YAxis
            tickFormatter={fmtAxis}
            tick={{ fontSize: 11 }}
            className="text-muted-foreground"
            width={60}
          />
          <Tooltip
            formatter={(value) => [
              fmtTooltip(Number(value)) + " " + data.currency,
            ]}
            contentStyle={{ fontSize: 12 }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="ingresos"     name="Ingresos"        fill="#10b981" radius={[2, 2, 0, 0]} />
          <Bar dataKey="egresos"      name="Egresos"         fill="#ef4444" radius={[2, 2, 0, 0]} />
          <Bar dataKey="netOperativo" name="Neto operativo"  fill="#6366f1" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
