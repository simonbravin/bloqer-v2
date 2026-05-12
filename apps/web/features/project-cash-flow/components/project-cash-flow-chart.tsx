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
import type { ProjectCashFlowPeriod } from "@bloqer/services";

interface Props {
  periods:  ProjectCashFlowPeriod[];
  currency: string;
}

export function ProjectCashFlowChart({ periods, currency }: Props) {
  if (periods.length === 0) return null;

  const data = periods.map((p) => ({
    name:     p.periodLabel,
    Ingresos: parseFloat(p.inflows),
    Egresos:  parseFloat(p.outflows),
    Neto:     parseFloat(p.netCashFlow),
  }));

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
          <Bar dataKey="Egresos"  fill="#ef4444" radius={[2, 2, 0, 0]} />
          <Bar dataKey="Neto"     fill="#6366f1" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
