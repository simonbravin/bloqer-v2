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
import type { ProjectCashFlowPeriod } from "@bloqer/services";

interface Props {
  periods: ProjectCashFlowPeriod[];
  currency: string;
  /** Trend line for evolution over time. Bars for detailed comparison. */
  variant?: "trend" | "bars";
}

export function ProjectCashFlowChart({ periods, currency, variant = "trend" }: Props) {
  if (periods.length === 0) return null;

  const data = periods.map((p) => ({
    name:     p.periodLabel,
    Ingresos: parseFloat(p.inflows),
    Egresos:  parseFloat(p.outflows),
    Neto:     parseFloat(p.netCashFlow),
  }));

  function fmtAxis(v: number) {
    if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(0)}k`;
    return v.toLocaleString("es-AR", { maximumFractionDigits: 0 });
  }

  function fmtTooltip(v: number) {
    return v.toLocaleString("es-AR", { minimumFractionDigits: 2 });
  }

  if (variant === "trend") {
    return (
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
            <YAxis tickFormatter={fmtAxis} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={52} />
            <Tooltip
              formatter={(value) => [`${fmtTooltip(Number(value))} ${currency}`, "Neto"]}
              contentStyle={{
                fontSize: 12,
                borderRadius: 8,
                border: "1px solid hsl(var(--border))",
                background: "hsl(var(--card))",
              }}
            />
            <defs>
              <linearGradient id="projectCashNetFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6366f1" stopOpacity={0.25} />
                <stop offset="100%" stopColor="#6366f1" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <Area type="monotone" dataKey="Neto" stroke="none" fill="url(#projectCashNetFill)" legendType="none" />
            <Line
              type="monotone"
              dataKey="Neto"
              name="Neto"
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
        <BarChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip formatter={(value) => [Number(value).toLocaleString("es-AR", { minimumFractionDigits: 2 }) + " " + currency]} />
          <Legend />
          <Bar dataKey="Ingresos" fill="#10b981" radius={[2, 2, 0, 0]} />
          <Bar dataKey="Egresos" fill="#ef4444" radius={[2, 2, 0, 0]} />
          <Bar dataKey="Neto" fill="#6366f1" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
