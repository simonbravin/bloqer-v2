"use client";

import Link from "next/link";
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
import type {
  ProjectOverviewBillingVsCollections,
  ProjectOverviewCashFlowMini,
} from "@bloqer/services";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

function moneyTooltip(value: number | string) {
  const n = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(n)) return value;
  return n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function ProjectOverviewCharts({
  projectId,
  billingVsCollections,
  cashFlowMini,
  cashFlowHref,
}: {
  projectId: string;
  billingVsCollections: ProjectOverviewBillingVsCollections | null;
  cashFlowMini: ProjectOverviewCashFlowMini | null;
  cashFlowHref?: string;
}) {
  const billingRows = useMemo(() => {
    if (!billingVsCollections) return [];
    const cur = new Set([
      ...billingVsCollections.invoicedByCurrency.map((r) => r.currency),
      ...billingVsCollections.collectedByCurrency.map((r) => r.currency),
    ]);
    return [...cur]
      .sort()
      .map((currency) => ({
        currency,
        facturado: Number(billingVsCollections.invoicedByCurrency.find((r) => r.currency === currency)?.amount ?? 0),
        cobrado: Number(billingVsCollections.collectedByCurrency.find((r) => r.currency === currency)?.amount ?? 0),
      }));
  }, [billingVsCollections]);

  const cashRows = useMemo(() => {
    if (!cashFlowMini) return [];
    return cashFlowMini.points.map((p) => ({
      periodo: p.label,
      ingresos: Number(p.inflows),
      egresos: Number(p.outflows),
    }));
  }, [cashFlowMini]);

  const base = `/proyectos/${projectId}`;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="rounded-xl border bg-card shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Facturación y cobranzas</CardTitle>
          <CardDescription>
            Total facturado (emitido) vs cobranzas confirmadas por moneda. Sin conversión de cambio.
          </CardDescription>
        </CardHeader>
        <CardContent className="h-72 pt-0">
          {billingRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Sin datos de facturas emitidas o cobranzas confirmadas para graficar.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={billingRows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="currency" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : `${v}`)} />
                <Tooltip formatter={(v) => moneyTooltip(v as number)} labelFormatter={(l) => `Moneda ${l}`} />
                <Legend />
                <Bar dataKey="facturado" name="Facturado" fill="#1e40af" radius={[4, 4, 0, 0]} />
                <Bar dataKey="cobrado" name="Cobrado" fill="#64748b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-xl border bg-card shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Flujo de caja imputado</CardTitle>
          <CardDescription>
            Cobros y pagos del proyecto agrupados por mes
            {cashFlowMini ? ` (${cashFlowMini.currency})` : ""}.
          </CardDescription>
        </CardHeader>
        <CardContent className="h-72 pt-0">
          {cashRows.length === 0 ? (
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>No hay movimientos en el rango consultado o no tenés permiso para ver el detalle.</p>
              {cashFlowHref ? (
                <Link href={cashFlowHref} className="font-medium text-primary underline-offset-4 hover:underline">
                  Abrir flujo de caja
                </Link>
              ) : (
                <Link href={`${base}/flujo-caja`} className="font-medium text-primary underline-offset-4 hover:underline">
                  Abrir flujo de caja
                </Link>
              )}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={cashRows} margin={{ top: 8, right: 8, left: 0, bottom: 32 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="periodo" tick={{ fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={48} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : `${v}`)} />
                <Tooltip formatter={(v) => moneyTooltip(v as number)} />
                <Legend />
                <Bar dataKey="ingresos" name="Ingresos (cobros)" fill="#15803d" radius={[4, 4, 0, 0]} />
                <Bar dataKey="egresos" name="Egresos (pagos)" fill="#b91c1c" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
          {cashRows.length > 0 && cashFlowHref ? (
            <p className="mt-2 text-center text-xs">
              <Link href={cashFlowHref} className="text-primary underline-offset-4 hover:underline">
                Ver flujo de caja completo
              </Link>
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
