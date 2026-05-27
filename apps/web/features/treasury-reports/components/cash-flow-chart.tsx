"use client";

import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { CashFlowCurrency } from "@bloqer/services";

interface Props {
  data: CashFlowCurrency;
  /** Trend line for evolution over time (dashboard). Bars for detailed comparison (reports). */
  variant?: "trend" | "bars";
}

export function CashFlowChart({ data, variant = "bars" }: Props) {
  if (data.buckets.length === 0) return null;

  const chartData = data.buckets.map((b) => ({
    period:       b.period,
    ingresos:     parseFloat(b.inflow),
    egresos:      parseFloat(b.outflow),
    netOperativo: parseFloat(b.netOperatingCashFlow),
  }));

  function fmtAxis(v: number) {
    if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (Math.abs(v) >= 1_000)     return `${(v / 1_000).toFixed(0)}k`;
    return v.toLocaleString("es-AR", { maximumFractionDigits: 0 });
  }

  function fmtTooltip(v: number) {
    return v.toLocaleString("es-AR", { minimumFractionDigits: 2 });
  }

  if (variant === "trend") {
    return (
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
            <XAxis
              dataKey="period"
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              className="text-muted-foreground"
            />
            <YAxis
              tickFormatter={fmtAxis}
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              className="text-muted-foreground"
              width={52}
            />
            <Tooltip
              formatter={(value, name) => [
                `${fmtTooltip(Number(value))} ${data.currency}`,
                name === "netOperativo" ? "Neto operativo" : String(name),
              ]}
              contentStyle={{
                fontSize: 12,
                borderRadius: 8,
                border: "1px solid hsl(var(--border))",
                background: "hsl(var(--card))",
              }}
              labelStyle={{ color: "hsl(var(--muted-foreground))" }}
            />
            <defs>
              <linearGradient id="netFlowFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6366f1" stopOpacity={0.25} />
                <stop offset="100%" stopColor="#6366f1" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey="netOperativo"
              stroke="none"
              fill="url(#netFlowFill)"
              legendType="none"
            />
            <Line
              type="monotone"
              dataKey="netOperativo"
              name="Neto operativo"
              stroke="#6366f1"
              strokeWidth={2.5}
              dot={{ r: 3, fill: "#6366f1", strokeWidth: 0 }}
              activeDot={{ r: 5, fill: "#6366f1", strokeWidth: 2, stroke: "hsl(var(--background))" }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
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
