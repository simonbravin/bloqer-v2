import Link from "next/link";
import { redirect } from "next/navigation";
import { getProjectPortfolioReport, ServiceError } from "@bloqer/services";
import { getCurrentUser } from "@/lib/auth";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { ReportExportActions, ReportSubnav } from "@/features/reports";
import { formatMoneyAmount } from "@/lib/format-money";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableScroll } from "@/components/ui/table-scroll";

function portfolioAmount(amount: string, currency: string | null): string {
  return currency ? formatMoneyAmount(amount, currency) : "—";
}

export default async function PortafolioReportPage() {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  let report;
  try {
    report = await getProjectPortfolioReport(ctx);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "FORBIDDEN") redirect("/reportes");
    throw err;
  }

  return (
    <PageShell variant="default" className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Portafolio de proyectos</h1>
          <p className="text-sm text-muted-foreground">
            Costos y exposición de las obras disponibles, sin las canceladas. Acceso a la EDT de cada obra.
          </p>
        </div>
        <ReportExportActions exportPath="/api/reports/portafolio.csv" params={{}} pdf xlsx />
      </div>

      <ReportSubnav>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/reportes">← Reportes</Link>
        </Button>
      </ReportSubnav>

      {report.warnings.length > 0 ? (
        <div className="rounded-lg border border-yellow-300 bg-yellow-50 dark:bg-yellow-950/20 p-3 space-y-1">
          {report.warnings.map((w) => (
            <p key={w} className="text-xs text-yellow-700 dark:text-yellow-400">
              {w}
            </p>
          ))}
        </div>
      ) : null}

      {report.rows.length === 0 ? (
        <div className="rounded-lg border bg-card p-12 text-center text-sm text-muted-foreground">
          No hay proyectos para mostrar.
        </div>
      ) : (
        <TableScroll>
          <Table className="text-xs">
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Proyecto</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Moneda</TableHead>
                <TableHead className="text-right">Presupuesto</TableHead>
                <TableHead className="text-right">Comprometido</TableHead>
                <TableHead className="text-right">Devengado</TableHead>
                <TableHead className="text-right">Exposición</TableHead>
                <TableHead className="text-right">Variación</TableHead>
                <TableHead className="text-right">% Exp.</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.rows.map((row) => (
                <TableRow key={row.projectId}>
                  <TableCell className="font-mono">{row.code}</TableCell>
                  <TableCell>
                    <div className="font-medium">{row.name}</div>
                    {row.warning ? (
                      <div className="text-[10px] text-amber-700 dark:text-amber-400">{row.warning}</div>
                    ) : null}
                  </TableCell>
                  <TableCell>{row.status}</TableCell>
                  <TableCell>{row.currency ?? "—"}</TableCell>
                  <TableCell className="text-right">{portfolioAmount(row.budgetTotalCost, row.currency)}</TableCell>
                  <TableCell className="text-right">{portfolioAmount(row.committedCost, row.currency)}</TableCell>
                  <TableCell className="text-right">{portfolioAmount(row.accruedCost, row.currency)}</TableCell>
                  <TableCell className="text-right font-medium">
                    {portfolioAmount(row.expectedCostExposure, row.currency)}
                  </TableCell>
                  <TableCell className="text-right">{portfolioAmount(row.costVariance, row.currency)}</TableCell>
                  <TableCell className="text-right">
                    {row.pctExposure != null ? `${row.pctExposure}%` : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" asChild className="h-7 text-xs">
                      <Link href={`/proyectos/${row.projectId}/control-costos`}>EDT</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableScroll>
      )}
    </PageShell>
  );
}
