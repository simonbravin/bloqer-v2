import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import {
  getProjectGgOverviewReport,
  getProjectShellInfo,
  ServiceError,
} from "@bloqer/services";
import { ReportDateFilters, ReportExportActions, ReportSubnav } from "@/features/reports";
import { PageShell } from "@/components/layout/page-shell";
import { ProjectPageHeader } from "@/components/layout/project-page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiStatCard } from "@/components/ui/kpi-stat-card";
import { KpiStatGrid } from "@/components/ui/kpi-stat-grid";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableScroll } from "@/components/ui/table-scroll";
import { formatMoneyAmount } from "@/lib/format-money";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ budgetId?: string }>;
}

export default async function ReporteGastosGeneralesObraPage({ params, searchParams }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id: projectId } = await params;
  const sp = await searchParams;

  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  try {
    await getProjectShellInfo(projectId, ctx);
  } catch (err) {
    if (err instanceof ServiceError && (err.code === "NOT_FOUND" || err.code === "FORBIDDEN")) {
      notFound();
    }
    throw err;
  }

  let report;
  try {
    report = await getProjectGgOverviewReport(projectId, { budgetId: sp.budgetId }, ctx);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "FORBIDDEN") redirect("/dashboard");
    throw err;
  }

  const availableBudgets =
    report.type === "REPORT" ||
    report.type === "BUDGET_SELECTION_REQUIRED" ||
    report.type === "NO_APPROVED_BUDGETS"
      ? report.availableBudgets
      : [];

  return (
    <PageShell variant="default" className="space-y-6">
      <ProjectPageHeader
        title="Gastos generales de obra"
        subtitle={
          report.type === "REPORT"
            ? `${report.budgetName} · presupuesto GG vs gastado (partidas + sin EDT + GG empresa)`
            : "Presupuesto GG vs gastado (partidas + sin EDT + GG empresa)"
        }
        actions={
          report.type === "REPORT" ? (
            <ReportExportActions
              exportPath={`/api/reports/proyectos/${projectId}/gastos-generales.csv`}
              params={sp}
            />
          ) : undefined
        }
      />

      <ReportSubnav>
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/proyectos/${projectId}/reportes`}>← Reportes</Link>
        </Button>
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/proyectos/${projectId}/control-costos`}>EDT y costos</Link>
        </Button>
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/proyectos/${projectId}/reportes/rentabilidad`}>Rentabilidad</Link>
        </Button>
        {report.type === "REPORT" && report.summary.companyOverheadVisible ? (
          <Button variant="ghost" size="sm" asChild>
            <Link href="/finanzas/gastos-generales">Imputación GG</Link>
          </Button>
        ) : null}
      </ReportSubnav>

      <ReportDateFilters budgets={availableBudgets} currentBudgetId={sp.budgetId} showDateRange={false} />

      {report.type === "NO_APPROVED_BUDGETS" ? (
        <div className="rounded-lg border bg-card p-8 text-center space-y-3">
          <p className="font-semibold">No hay presupuesto aprobado o cerrado</p>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/proyectos/${projectId}/presupuestos`}>Ir a presupuestos</Link>
          </Button>
        </div>
      ) : report.type === "BUDGET_SELECTION_REQUIRED" ? (
        <div className="rounded-lg border bg-card p-8 text-center space-y-3">
          <p className="font-semibold">Elegí un presupuesto</p>
          <p className="text-sm text-muted-foreground">
            Hay más de un presupuesto aprobado o cerrado. Seleccioná uno en el filtro de arriba.
          </p>
        </div>
      ) : (
        <>
          {report.warnings.length > 0 && (
            <div className="rounded-lg border border-yellow-300 bg-yellow-50 dark:bg-yellow-950/20 p-3 space-y-1">
              {report.warnings.map((w, i) => (
                <p key={i} className="text-xs text-yellow-700 dark:text-yellow-400">
                  {w}
                </p>
              ))}
            </div>
          )}

          {report.notes.length > 0 && (
            <div className="rounded-lg border bg-muted/40 p-3 space-y-1">
              {report.notes.map((n, i) => (
                <p key={i} className="text-xs text-muted-foreground">
                  {n}
                </p>
              ))}
            </div>
          )}

          <KpiStatGrid>
            <KpiStatCard
              label="Presupuesto GG"
              value={formatMoneyAmount(report.summary.budgetedGg)}
              subtitle={report.currency}
              iconKey="budget"
            />
            <KpiStatCard
              label="Total gastado"
              value={formatMoneyAmount(report.summary.spentTotal)}
              subtitle={
                report.summary.spentPctOfBudget
                  ? `${report.summary.spentPctOfBudget}% del presupuesto`
                  : report.currency
              }
              iconKey="accrued"
            />
            <KpiStatCard
              label="Restante vs presupuesto"
              value={formatMoneyAmount(report.summary.remainingVsBudget)}
              helper="Presupuesto − gastado"
              iconKey="variance"
            />
            <KpiStatCard
              label="GG empresa imputados"
              value={
                report.summary.companyOverheadVisible && report.summary.companyOverhead != null
                  ? formatMoneyAmount(report.summary.companyOverhead)
                  : "—"
              }
              helper={
                report.summary.companyOverheadVisible
                  ? "Desde Imputación GG"
                  : "Solo OWNER / ADMIN"
              }
              iconKey="overhead"
            />
          </KpiStatGrid>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Desglose del gastado</CardTitle>
              <p className="text-xs text-muted-foreground">
                Total = devengado en partidas GG + devengado sin EDT
                {report.summary.companyOverheadIncludedInSpent ? " + GG empresa" : ""}
                . El comprometido abierto (partidas o sin EDT) se muestra aparte y no suma al Total gastado.
              </p>
            </CardHeader>
            <CardContent>
              <TableScroll>
                <Table className="text-xs">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Concepto</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell>Devengado en partidas GG</TableCell>
                      <TableCell className="text-right font-mono">
                        {formatMoneyAmount(report.summary.accruedOnGgPartidas)}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>Comprometido abierto en partidas GG</TableCell>
                      <TableCell className="text-right font-mono">
                        {formatMoneyAmount(report.summary.openCommittedOnGgPartidas)}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>Sin partida EDT — comprometido</TableCell>
                      <TableCell className="text-right font-mono">
                        {formatMoneyAmount(report.summary.unallocatedCommitted)}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>Sin partida EDT — devengado</TableCell>
                      <TableCell className="text-right font-mono">
                        {formatMoneyAmount(report.summary.unallocatedAccrued)}
                      </TableCell>
                    </TableRow>
                    {report.summary.companyOverheadVisible && report.summary.companyOverhead != null ? (
                      <TableRow>
                        <TableCell>GG empresa imputados a la obra</TableCell>
                        <TableCell className="text-right font-mono">
                          {formatMoneyAmount(report.summary.companyOverhead)}
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </TableScroll>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Partidas GG detectadas</CardTitle>
              <p className="text-xs text-muted-foreground">
                Por nombre/código (o grupo padre): «Gastos generales», «Indirectos», «GG», etc.
              </p>
            </CardHeader>
            <CardContent>
              {report.ggPartidas.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  Sin partidas detectadas. Renombrá el capítulo/ítem de indirectos en el presupuesto.
                </p>
              ) : (
                <TableScroll>
                  <Table className="text-xs">
                    <TableHeader className="sticky top-0 z-10 bg-muted/50">
                      <TableRow>
                        <TableHead>EDT</TableHead>
                        <TableHead>Partida</TableHead>
                        <TableHead className="text-right">Presupuesto</TableHead>
                        <TableHead className="text-right">Devengado</TableHead>
                        <TableHead className="text-right">Comprom. abierto</TableHead>
                        <TableHead className="text-right">Pagado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {report.ggPartidas.map((row) => (
                        <TableRow key={row.wbsNodeId}>
                          <TableCell className="font-mono">
                            <Link
                              href={`/proyectos/${projectId}/control-costos/${row.wbsNodeId}`}
                              className="underline-offset-2 hover:underline"
                            >
                              {row.wbsCode}
                            </Link>
                          </TableCell>
                          <TableCell className="max-w-[14rem] truncate" title={row.wbsName}>
                            {row.wbsName}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {formatMoneyAmount(row.budgetTotalCost)}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {formatMoneyAmount(row.accruedCost)}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {formatMoneyAmount(row.openCommittedCost)}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {formatMoneyAmount(row.paidCost)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableScroll>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Documentos sin partida EDT</CardTitle>
              <p className="text-xs text-muted-foreground">
                Líneas de OC o factura de obra sin partida EDT. El Total gastado usa el
                devengado sin EDT de la pantalla EDT y costos (no la suma cruda de esta
                tabla: puede mezclar OC abierta + factura).
              </p>
            </CardHeader>
            <CardContent>
              {report.unallocatedDocuments.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No hay documentos sin partida EDT.
                </p>
              ) : (
                <TableScroll>
                  <Table className="text-xs">
                    <TableHeader className="sticky top-0 z-10 bg-muted/50">
                      <TableRow>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Documento</TableHead>
                        <TableHead>Proveedor</TableHead>
                        <TableHead>Descripción</TableHead>
                        <TableHead className="text-right">Monto</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {report.unallocatedDocuments.map((row, i) => (
                        <TableRow key={`${row.documentType}-${row.documentCode}-${i}`}>
                          <TableCell>{row.documentType === "PO_LINE" ? "OC" : "Factura"}</TableCell>
                          <TableCell className="font-mono">{row.documentCode}</TableCell>
                          <TableCell className="max-w-[10rem] truncate" title={row.supplierName}>
                            {row.supplierName}
                          </TableCell>
                          <TableCell className="max-w-[min(16rem,30vw)] truncate" title={row.description}>
                            {row.description}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {formatMoneyAmount(row.amount)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableScroll>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </PageShell>
  );
}
