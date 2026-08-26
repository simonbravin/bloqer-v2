"use client";

import Link from "next/link";
import type { ProjectProfitabilityReport } from "@bloqer/services";
import { KpiStatCard } from "@/components/ui/kpi-stat-card";
import { KpiStatGrid } from "@/components/ui/kpi-stat-grid";
import { formatMoneyAmount, formatRatePctWithSymbol, isPositiveMoneyAmount, isZeroMoneyAmount } from "@/lib/format-money";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const LAYER_LABELS: Record<ProjectProfitabilityReport["costLayer"], string> = {
  exposure: "Exposición esperada",
  committed: "Comprometido",
  accrued: "Devengado",
  paid: "Pagado (caja)",
};

type Props = {
  report: ProjectProfitabilityReport;
};

function ggDisplayCurrency(report: ProjectProfitabilityReport): string {
  // AUTO_WEIGHT always ARS; MANUAL uses report currency (same as service).
  return report.overheadManualAmount != null ? report.currency : "ARS";
}

export function ProfitabilitySummary({ report }: Props) {
  const gmTone = isZeroMoneyAmount(report.grossMargin)
    ? "muted"
    : isPositiveMoneyAmount(report.grossMargin)
      ? "success"
      : "danger";

  const ggCurrency = ggDisplayCurrency(report);
  const isAutoWeight = report.overheadManualAmount == null && report.overheadCalculatedAmount != null;

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Presupuesto: {report.budgetName} · Ingresos ({report.revenueBasis === "certified" ? "certificado" : "facturado"}) −
        costos ({LAYER_LABELS[report.costLayer]})
      </p>

      <KpiStatGrid title={null} columns={4}>
        <KpiStatCard
          compact
          label="Ingresos"
          value={formatMoneyAmount(report.revenue, report.currency)}
        />
        <KpiStatCard
          compact
          label="Costos directos"
          value={formatMoneyAmount(report.directCost, report.currency)}
        />
        <KpiStatCard
          compact
          label="Margen bruto"
          value={formatMoneyAmount(report.grossMargin, report.currency)}
          tone={gmTone}
        />
        <KpiStatCard
          compact
          label="MB %"
          value={formatRatePctWithSymbol(report.grossMarginPct)}
          tone={gmTone}
        />
      </KpiStatGrid>

      <KpiStatGrid title={null} columns={2}>
        <KpiStatCard
          compact
          label="Venta presupuestada"
          value={formatMoneyAmount(report.budgetTotalSale, report.budgetCurrency)}
        />
        <KpiStatCard
          compact
          label="Margen proyectado (presup.)"
          value={formatMoneyAmount(report.projectedMargin, report.budgetCurrency)}
        />
      </KpiStatGrid>

      {report.currencyView === "original" && report.byCurrency.length > 1 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Desglose por moneda</CardTitle>
            <CardDescription>
              Costos directos imputados solo en {report.budgetCurrency}; otras monedas muestran ingresos facturados.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {report.byCurrency.map((slice) => (
              <div key={slice.currency} className="flex flex-wrap justify-between gap-2 border-b pb-2 last:border-0">
                <span className="font-mono font-medium">{slice.currency}</span>
                <span>
                  MB {formatMoneyAmount(slice.grossMargin, slice.currency)}
                  {slice.grossMarginPct != null ? ` (${formatRatePctWithSymbol(slice.grossMarginPct)})` : ""}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {report.consolidationBlocked ? (
        <p className="text-xs text-yellow-700 dark:text-yellow-400">
          Consolidado ARS no disponible para este proyecto/período; mostrando moneda del presupuesto ({report.currency}).
        </p>
      ) : null}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Margen neto (R-004)</CardTitle>
          <CardDescription>{report.netMarginNote}</CardDescription>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          {report.overheadAmount != null ? (
            <>
              <p>
                GG total imputado:{" "}
                {formatMoneyAmount(report.overheadAmount, ggCurrency)}
              </p>
              {report.overheadManualAmount != null &&
              isPositiveMoneyAmount(report.overheadManualAmount) ? (
                <p className="text-muted-foreground">
                  · Manual:{" "}
                  {formatMoneyAmount(report.overheadManualAmount, report.currency)}
                </p>
              ) : null}
              {report.overheadCalculatedAmount != null &&
              isPositiveMoneyAmount(report.overheadCalculatedAmount) ? (
                <p className="text-muted-foreground">
                  ·{" "}
                  {isAutoWeight
                    ? `Prorrateo por peso del CD${report.overheadCompanyPct ? ` (peso ${formatRatePctWithSymbol(report.overheadCompanyPct)})` : ""}`
                    : `${formatRatePctWithSymbol(report.overheadCompanyPct ?? "0")} empresa sobre CD devengado`}
                  :{" "}
                  {formatMoneyAmount(report.overheadCalculatedAmount, ggCurrency)}
                </p>
              ) : null}
              {report.netMarginAvailable && report.netMargin != null ? (
                <p className="font-semibold">
                  Margen neto: {formatMoneyAmount(report.netMargin, report.currency)}
                </p>
              ) : (
                <p className="text-muted-foreground">
                  Margen neto no disponible en esta vista (la moneda de los GG no coincide con la del reporte).
                </p>
              )}
              <p className="text-xs text-muted-foreground pt-1">
                Los GG de empresa no aparecen en EDT y costos.{" "}
                <Link href="/finanzas/gastos-generales" className="text-primary hover:underline">
                  Ver imputación GG
                </Link>
              </p>
            </>
          ) : (
            <p className="text-muted-foreground">{report.netMarginNote}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
