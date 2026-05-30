"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { ProjectFinanceDashboard } from "@bloqer/services";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableScroll } from "@/components/ui/table-scroll";
import { ProjectPageHeader } from "@/components/layout/project-page-header";
import { KpiStatGrid } from "@/components/ui/kpi-stat-grid";
import { DashboardKpiCard } from "@/features/dashboard/dashboard-kpi-card";
import { IncomeExpenseChart } from "@/features/reports/income-expense-chart";
import { CostCompositionChart } from "@/features/projects/cost-composition-chart";
import { ProjectCashFlowChart } from "@/features/project-cash-flow/components/project-cash-flow-chart";
import { KpiStatCard } from "@/components/ui/kpi-stat-card";
import { formatMoneyAmount } from "@/lib/format-money";

function warningText(w: { module: string; section: string; reason: string }): string {
  if (w.reason === "TENANT_MODULE_DISABLED") return `Módulo ${w.module} deshabilitado (${w.section}).`;
  if (w.reason === "MISSING_PERMISSION") return `Sin permiso para ${w.module} (${w.section}).`;
  return `No se pudieron cargar datos de ${w.module} (${w.section}).`;
}

function MoneyList({ rows, emptyLabel }: { rows: { currency: string; amount: string }[]; emptyLabel: string }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  return (
    <ul className="space-y-1 text-sm">
      {rows.map((r) => (
        <li key={r.currency} className="flex justify-between gap-2 tabular-nums">
          <span className="text-muted-foreground">{r.currency}</span>
          <span className="font-medium">{formatMoneyAmount(r.amount, r.currency)}</span>
        </li>
      ))}
    </ul>
  );
}

export function ProjectFinanceDashboardView({ dashboard }: { dashboard: ProjectFinanceDashboard }) {
  const { project, sections, warnings } = dashboard.overview;
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = project.id;
  const moneyCurrency = dashboard.incomeExpense?.displayCurrency ?? "ARS";

  function setMonths(months: number) {
    const p = new URLSearchParams(searchParams.toString());
    p.set("months", String(months));
    router.replace(`/proyectos/${projectId}/finanzas?${p.toString()}`, { scroll: false });
  }

  const wbs =
    dashboard.wbsAlerts && "nearCompletion" in dashboard.wbsAlerts ? dashboard.wbsAlerts : null;
  const composition =
    dashboard.costComposition && dashboard.costComposition.type === "COMPOSITION"
      ? dashboard.costComposition
      : null;

  const cashCur =
    dashboard.cashFlow?.currencies.find((c) => c.currency === moneyCurrency) ??
    dashboard.cashFlow?.currencies[0];

  return (
    <div className="space-y-6">
      <ProjectPageHeader
        projectId={projectId}
        projectName={project.name}
        title="Tablero de finanzas"
        subtitle={
          <span className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {project.code ? <span className="font-mono">{project.code}</span> : null}
            <Link href={`/proyectos/${projectId}`} className="underline underline-offset-2">
              Ver resumen de obra
            </Link>
          </span>
        }
      />

      {warnings.length > 0 ? (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100">
          <ul className="list-inside list-disc space-y-1">
            {warnings.map((w, i) => (
              <li key={`${w.module}-${i}`}>{warningText(w)}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {(dashboard.monthBalance || dashboard.monthCashFlow) && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Visión rápida del mes
            </h2>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={dashboard.months === 6 ? "secondary" : "outline"}
                onClick={() => setMonths(6)}
              >
                6 meses
              </Button>
              <Button
                type="button"
                size="sm"
                variant={dashboard.months === 12 ? "secondary" : "outline"}
                onClick={() => setMonths(12)}
              >
                12 meses
              </Button>
            </div>
          </div>
          <KpiStatGrid title={null} columns={4}>
            {dashboard.monthBalance ? (
              <>
                <KpiStatCard
                  label={`Balance (${dashboard.monthBalance.periodLabel})`}
                  value={formatMoneyAmount(
                    dashboard.monthBalance.grossMarginAccrued,
                    dashboard.monthBalance.currency,
                  )}
                  helper="MB devengado del último mes"
                  tone={
                    parseFloat(dashboard.monthBalance.grossMarginAccrued) >= 0 ? "success" : "danger"
                  }
                />
                <KpiStatCard
                  label="Certificado"
                  value={formatMoneyAmount(
                    dashboard.monthBalance.certifiedAmount,
                    dashboard.monthBalance.currency,
                  )}
                />
                <KpiStatCard
                  label="Costo devengado"
                  value={formatMoneyAmount(
                    dashboard.monthBalance.costAccrued,
                    dashboard.monthBalance.currency,
                  )}
                />
              </>
            ) : null}
            {dashboard.monthCashFlow ? (
              <KpiStatCard
                label={`Flujo de caja (${dashboard.monthCashFlow.periodLabel})`}
                value={formatMoneyAmount(
                  dashboard.monthCashFlow.netCashFlow,
                  dashboard.monthCashFlow.currency,
                )}
                helper={`Entradas ${formatMoneyAmount(dashboard.monthCashFlow.inflows, dashboard.monthCashFlow.currency)} · Salidas ${formatMoneyAmount(dashboard.monthCashFlow.outflows, dashboard.monthCashFlow.currency)}`}
                tone={
                  parseFloat(dashboard.monthCashFlow.netCashFlow) >= 0 ? "success" : "danger"
                }
              />
            ) : null}
          </KpiStatGrid>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {dashboard.incomeExpense && dashboard.incomeExpense.series.length > 0 ? (
          <IncomeExpenseChart
            series={dashboard.incomeExpense.series}
            variant="trend"
            title="Tendencia mensual"
            description={`Últimos ${dashboard.months} meses · capa devengada`}
          />
        ) : (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              Sin tendencia de ingresos vs gastos.{" "}
              <Link
                href={`/proyectos/${projectId}/reportes/ingresos-gastos`}
                className="underline underline-offset-2"
              >
                Ver reporte
              </Link>
            </CardContent>
          </Card>
        )}
        {composition ? (
          <CostCompositionChart composition={composition} />
        ) : (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Composición de gastos</CardTitle>
              <CardDescription>Costo devengado por rubro APU</CardDescription>
            </CardHeader>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              Sin datos de composición.{" "}
              <Link
                href={`/proyectos/${projectId}/control-costos`}
                className="underline underline-offset-2"
              >
                Control de costos
              </Link>
            </CardContent>
          </Card>
        )}
      </div>

      {cashCur && cashCur.periods.length > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Flujo de caja mensual</CardTitle>
            <CardDescription>
              Movimientos confirmados ·{" "}
              <Link href={`/proyectos/${projectId}/flujo-caja`} className="underline underline-offset-2">
                Ver detalle
              </Link>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ProjectCashFlowChart
              periods={cashCur.periods}
              currency={cashCur.currency}
              variant="trend"
            />
          </CardContent>
        </Card>
      ) : null}

      {dashboard.kpis.length > 0 ? (
        <KpiStatGrid title="Indicadores" columns={3}>
          {dashboard.kpis.map((k) => (
            <DashboardKpiCard key={k.key} kpi={k} />
          ))}
        </KpiStatGrid>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {sections.ar?.canView ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Cuentas por cobrar</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <MoneyList rows={sections.ar.totalReceivableByCurrency} emptyLabel="Sin saldo abierto." />
              <Button asChild variant="outline" size="sm">
                <Link href={sections.ar.links.receivables}>Ver C×C</Link>
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {sections.ap?.canView ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Cuentas por pagar</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <MoneyList rows={sections.ap.totalPayableByCurrency} emptyLabel="Sin saldo abierto." />
              <Button asChild variant="outline" size="sm">
                <Link href={sections.ap.links.payables}>Ver C×P</Link>
              </Button>
            </CardContent>
          </Card>
        ) : null}
      </div>

      {dashboard.cashProjection && dashboard.cashProjection.currencies.length > 0 ? (
        <Card>
          <CardHeader className="border-b border-border/60">
            <CardTitle className="text-base">Proyección de caja (90 días)</CardTitle>
            <CardDescription>
              Cobros y pagos esperados por C×C/C×P de la obra.{" "}
              <Link href={`/proyectos/${projectId}/reportes/caja`} className="underline underline-offset-2">
                Reporte completo
              </Link>
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <TableScroll>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Moneda</TableHead>
                    <TableHead className="text-right">Cobros esp.</TableHead>
                    <TableHead className="text-right">Pagos esp.</TableHead>
                    <TableHead className="text-right">Neto esp.</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dashboard.cashProjection.currencies.map((c) => (
                    <TableRow key={c.currency}>
                      <TableCell>{c.currency}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoneyAmount(c.totalExpectedInflows, c.currency)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoneyAmount(c.totalExpectedOutflows, c.currency)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {formatMoneyAmount(c.netExpected, c.currency)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableScroll>
          </CardContent>
        </Card>
      ) : null}

      {dashboard.incomeExpense && dashboard.incomeExpense.series.length > 0 ? (
        <IncomeExpenseChart
          series={dashboard.incomeExpense.series}
          title="Ingresos vs gastos (detalle)"
          description="Certificado vs costo devengado con capa de caja"
        />
      ) : null}

      {dashboard.topSuppliers.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top proveedores</CardTitle>
            <CardDescription>Por costo devengado en la obra</CardDescription>
          </CardHeader>
          <CardContent>
            <TableScroll>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Proveedor</TableHead>
                    <TableHead className="text-right">Devengado</TableHead>
                    <TableHead className="text-right">Pagado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dashboard.topSuppliers.map((s) => (
                    <TableRow key={s.supplierContactId}>
                      <TableCell className="font-medium">{s.supplierName}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoneyAmount(s.accruedCost, moneyCurrency)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {formatMoneyAmount(s.paidCost, moneyCurrency)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableScroll>
            <Button asChild variant="link" size="sm" className="mt-3 px-0">
              <Link href={`/proyectos/${projectId}/reportes/compras-proveedores`}>
                Ver reporte de compras
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {wbs &&
      (wbs.nearCompletion.length > 0 ||
        wbs.favorableAtCompletion.length > 0 ||
        wbs.unfavorableAtCompletion.length > 0) ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {wbs.nearCompletion.length > 0 ? (
            <WbsTable
              title="WBS cerca de completarse"
              description="Avance físico (libro de obra aprobado) entre 85% y 99%"
              rows={wbs.nearCompletion}
              valueColumn="progressPct"
              valueSuffix="%"
            />
          ) : null}
          {wbs.unfavorableAtCompletion.length > 0 ? (
            <WbsTable
              title="Sobre presupuesto al 100%"
              description="Partidas completas con costo esperado superior al presupuestado"
              rows={wbs.unfavorableAtCompletion}
              valueColumn="varianceAmount"
              moneyCurrency={moneyCurrency}
              tone="destructive"
            />
          ) : null}
          {wbs.favorableAtCompletion.length > 0 ? (
            <WbsTable
              title="Bajo presupuesto al 100%"
              description="Partidas completas con ahorro vs presupuesto"
              rows={wbs.favorableAtCompletion}
              valueColumn="varianceAmount"
              moneyCurrency={moneyCurrency}
            />
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {sections.budget?.canViewCostControl ? (
          <Button asChild variant="outline" size="sm">
            <Link href={sections.budget.costControlLink}>Control de costos</Link>
          </Button>
        ) : null}
        {sections.treasury?.canView ? (
          <Button asChild variant="outline" size="sm">
            <Link href={sections.treasury.cashFlowLink}>Flujo de caja</Link>
          </Button>
        ) : null}
        <Button asChild variant="outline" size="sm">
          <Link href={`/proyectos/${projectId}/reportes`}>Hub de reportes</Link>
        </Button>
      </div>
    </div>
  );
}

function WbsTable({
  title,
  description,
  rows,
  valueColumn,
  valueSuffix = "",
  moneyCurrency = "ARS",
  tone,
}: {
  title: string;
  description: string;
  rows: {
    wbsCode: string;
    wbsName: string;
    href: string;
    progressPct?: string;
    varianceAmount?: string;
  }[];
  valueColumn: "progressPct" | "varianceAmount";
  valueSuffix?: string;
  moneyCurrency?: string;
  tone?: "destructive";
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <TableScroll>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Partida</TableHead>
                <TableHead className="text-right">{valueColumn === "progressPct" ? "Avance" : "Varianza"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.href}>
                  <TableCell>
                    <Link href={r.href} className="font-medium hover:underline">
                      <span className="font-mono text-xs text-muted-foreground">{r.wbsCode}</span>
                      <span className="ml-2">{r.wbsName}</span>
                    </Link>
                  </TableCell>
                  <TableCell
                    className={
                      tone === "destructive"
                        ? "text-right tabular-nums font-medium text-destructive"
                        : "text-right tabular-nums font-medium"
                    }
                  >
                    {valueColumn === "progressPct"
                      ? `${r.progressPct}${valueSuffix}`
                      : formatMoneyAmount(r.varianceAmount ?? "0", moneyCurrency)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableScroll>
      </CardContent>
    </Card>
  );
}
