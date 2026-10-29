"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ProjectProgressReport } from "@bloqer/services";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CHART_SERIES } from "@/lib/chart-series-colors";
import { formatChartAxis, formatMoneyAmount, formatRatePctWithSymbol } from "@/lib/format-money";
import { formatProjectProgressChartAmount } from "./lib/project-progress-chart-format";

type Props = { report: ProjectProgressReport };

// Recharts needs numeric coordinates; all business calculations come from the service.
function coordinate(value: string | null): number | null {
  if (value === null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function ProjectProgressCharts({ report }: Props) {
  const data = report.series.map((point) => ({
    ...point,
    physical: coordinate(point.physicalPct),
    observed: point.physicalPct === null ? coordinate(point.physicalObservedPct) : null,
    planned: coordinate(point.planPct),
    plannedObserved: point.planPct === null ? coordinate(point.planObservedPct) : null,
    certifiedValue: coordinate(point.certified),
    invoicedValue: coordinate(point.invoiced),
    collectedValue: coordinate(point.collected),
  }));
  const partialPhysical = report.series.some(
    (point) => point.physicalPct === null && point.physicalObservedPct !== null,
  );
  const partialPlan = report.series.some(
    (point) => point.planPct === null && point.planObservedPct !== null,
  );
  const hasPhysical = data.some(
    (point) =>
      point.physical !== null ||
      point.observed !== null ||
      point.planned !== null ||
      point.plannedObserved !== null,
  );
  const hasFinancial = data.some(
    (point) =>
      point.certifiedValue !== null ||
      point.invoicedValue !== null ||
      point.collectedValue !== null,
  );
  const costs = [
    {
      name: "Presupuesto",
      value: coordinate(report.financial.budgetCost),
      raw: report.financial.budgetCost,
      color: "#64748b",
    },
    {
      name: "Exposición",
      value: coordinate(report.financial.costExposure),
      raw: report.financial.costExposure,
      color: "#8b5cf6",
    },
    {
      name: "Devengado",
      value: coordinate(report.financial.costAccrued),
      raw: report.financial.costAccrued,
      color: CHART_SERIES.costAccrued,
    },
    {
      name: "Pagado",
      value: coordinate(report.financial.costPaid),
      raw: report.financial.costPaid,
      color: CHART_SERIES.costPaid,
    },
  ].filter((point) => point.value !== null);

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden rounded-xl">
        <CardHeader>
          <CardTitle className="text-base">Plan y ejecución registrada</CardTitle>
          <CardDescription>
            Porcentaje acumulado, ponderado por costo presupuestado de las mismas partidas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {hasPhysical ? (
            <div
              className="h-[260px] w-full min-w-0 sm:h-[320px]"
              role="img"
              aria-label="Evolución del avance planificado y del libro de obra aprobado"
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data} margin={{ top: 10, right: 14, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 4" className="stroke-border" vertical={false} />
                  <XAxis
                    dataKey="periodLabel"
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    unit="%"
                    domain={[0, "auto"]}
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={48}
                  />
                  <Tooltip
                    formatter={(value: number) => formatRatePctWithSymbol(String(value))}
                    contentStyle={{ borderRadius: 10, fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, paddingTop: 12 }} />
                  <Line
                    name="Plan completo"
                    dataKey="planned"
                    stroke="#64748b"
                    strokeWidth={2}
                    dot={{ r: 2 }}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                  <Line
                    name="Ejecutado · libro aprobado"
                    dataKey="physical"
                    stroke="#4f46e5"
                    strokeWidth={3}
                    dot={{ r: 3 }}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                  {partialPlan ? (
                    <Line
                      name="Plan observado · cobertura parcial"
                      dataKey="plannedObserved"
                      stroke="#94a3b8"
                      strokeWidth={2}
                      strokeDasharray="4 4"
                      dot={{ r: 2 }}
                      connectNulls={false}
                      isAnimationActive={false}
                    />
                  ) : null}
                  {partialPhysical ? (
                    <Line
                      name="Ejecutado observado · cobertura parcial"
                      dataKey="observed"
                      stroke="#818cf8"
                      strokeWidth={2}
                      strokeDasharray="4 4"
                      dot={{ r: 2 }}
                      connectNulls={false}
                      isAnimationActive={false}
                    />
                  ) : null}
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyChart>
              Faltan mediciones aprobadas o fechas de planificación para graficar.
            </EmptyChart>
          )}
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            La línea completa requiere cobertura de toda la base ponderada. La línea punteada
            muestra sólo la contribución conocida sobre la base total; las partidas sin datos no se
            toman como ejecutadas ni se redistribuye su peso. El plan usa las fechas actuales del
            cronograma.
          </p>
        </CardContent>
      </Card>

      <div className="grid min-w-0 gap-5 xl:grid-cols-2">
        <Card className="min-w-0 rounded-xl">
          <CardHeader>
            <CardTitle className="text-base">Certificación, facturación y cobranza</CardTitle>
            <CardDescription>
              Importes acumulados en {report.currency}. Cada serie conserva su propia fuente.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {hasFinancial ? (
              <div
                className="h-[250px] w-full min-w-0"
                role="img"
                aria-label={`Evolución acumulada de certificado, facturado y cobrado en ${report.currency}`}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data} margin={{ top: 8, right: 10, left: 0, bottom: 4 }}>
                    <CartesianGrid
                      strokeDasharray="3 4"
                      className="stroke-border"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="periodLabel"
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tickFormatter={formatChartAxis}
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      width={58}
                    />
                    <Tooltip
                      formatter={(_value, _name, item) =>
                        formatProjectProgressChartAmount(
                          item.dataKey,
                          item.payload,
                          report.currency,
                        )
                      }
                      contentStyle={{ borderRadius: 10, fontSize: 12 }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11, paddingTop: 12 }} />
                    <Line
                      name="Certificado"
                      dataKey="certifiedValue"
                      stroke={CHART_SERIES.certified}
                      strokeWidth={2}
                      dot={{ r: 2 }}
                      connectNulls={false}
                      isAnimationActive={false}
                    />
                    <Line
                      name="Facturado"
                      dataKey="invoicedValue"
                      stroke={CHART_SERIES.invoiced}
                      strokeWidth={2}
                      dot={{ r: 2 }}
                      connectNulls={false}
                      isAnimationActive={false}
                    />
                    <Line
                      name="Cobrado"
                      dataKey="collectedValue"
                      stroke={CHART_SERIES.collected}
                      strokeWidth={2}
                      dot={{ r: 2 }}
                      connectNulls={false}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyChart>Sin información financiera disponible para tu acceso.</EmptyChart>
            )}
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              Facturado y cobrado incluyen impuestos según comprobantes; certificado usa el importe
              contractual. Su diferencia no equivale automáticamente a un saldo.
            </p>
          </CardContent>
        </Card>
        <Card className="min-w-0 rounded-xl">
          <CardHeader>
            <CardTitle className="text-base">Consumo del presupuesto de costos</CardTitle>
            <CardDescription>
              Capas independientes al corte en {report.currency}; no se suman.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {costs.length > 0 ? (
              <div
                className="h-[250px] w-full min-w-0"
                role="img"
                aria-label={`Comparación de presupuesto, exposición, costo devengado y pagado en ${report.currency}`}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={costs}
                    layout="vertical"
                    margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 4"
                      className="stroke-border"
                      horizontal={false}
                    />
                    <XAxis
                      type="number"
                      tickFormatter={formatChartAxis}
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={90}
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      formatter={(_value, _name, item) =>
                        formatMoneyAmount(item.payload.raw as string, report.currency)
                      }
                      cursor={{ fill: "hsl(var(--muted))" }}
                      contentStyle={{ borderRadius: 10, fontSize: 12 }}
                    />
                    <Bar
                      dataKey="value"
                      name="Importe"
                      radius={[0, 5, 5, 0]}
                      maxBarSize={26}
                      isAnimationActive={false}
                    >
                      {costs.map((item) => (
                        <Cell key={item.name} fill={item.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyChart>Sin información de costos disponible para tu acceso.</EmptyChart>
            )}
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              Gastar o pagar una partida no acredita su ejecución física.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function EmptyChart({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[200px] items-center justify-center rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}
