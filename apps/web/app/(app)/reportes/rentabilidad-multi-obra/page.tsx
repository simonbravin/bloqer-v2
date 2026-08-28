import Link from "next/link";
import { redirect } from "next/navigation";
import { getPortfolioProfitabilityReport, ServiceError } from "@bloqer/services";
import { getCurrentUser } from "@/lib/auth";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { ReportExportActions, ReportSubnav } from "@/features/reports";
import { formatMoneyAmount } from "@/lib/format-money";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableScroll } from "@/components/ui/table-scroll";

export default async function RentabilidadMultiObraPage() {
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
    report = await getPortfolioProfitabilityReport(ctx, {
      costLayer: "accrued",
      revenueBasis: "certified",
    });
  } catch (err) {
    if (err instanceof ServiceError && err.code === "FORBIDDEN") redirect("/reportes");
    throw err;
  }

  return (
    <PageShell variant="default" className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Rentabilidad multi-obra</h1>
          <p className="text-sm text-muted-foreground">
            Ingreso certificado vs costo devengado por obra. Consolidado al pie.
          </p>
        </div>
        <ReportExportActions exportPath="/api/reports/rentabilidad-multi-obra.csv" params={{}} />
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

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          {
            label: report.consolidatedCurrency
              ? `Ingresos consolidados (${report.consolidatedCurrency})`
              : "Ingresos consolidados",
            v: report.consolidatedRevenue,
          },
          {
            label: report.consolidatedCurrency
              ? `Costo directo (${report.consolidatedCurrency})`
              : "Costo directo",
            v: report.consolidatedDirectCost,
          },
          {
            label: report.consolidatedCurrency
              ? `Margen bruto (${report.consolidatedCurrency})`
              : "Margen bruto",
            v: report.consolidatedGrossMargin,
          },
        ].map((k) => (
          <div key={k.label} className="rounded-lg border bg-card p-4">
            <p className="text-xs text-muted-foreground">{k.label}</p>
            <p className="text-lg font-semibold tabular-nums">{formatMoneyAmount(k.v)}</p>
          </div>
        ))}
      </div>
      {report.consolidatedGrossMarginPct != null ? (
        <p className="text-sm text-muted-foreground">
          Margen bruto consolidado
          {report.consolidatedCurrency ? ` (${report.consolidatedCurrency})` : ""}:{" "}
          <strong>{report.consolidatedGrossMarginPct}%</strong>
        </p>
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
                <TableHead>Moneda</TableHead>
                <TableHead className="text-right">Ingresos</TableHead>
                <TableHead className="text-right">Costo directo</TableHead>
                <TableHead className="text-right">Margen bruto</TableHead>
                <TableHead className="text-right">MB %</TableHead>
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
                  <TableCell className="text-muted-foreground">{row.currency}</TableCell>
                  <TableCell className="text-right">{formatMoneyAmount(row.revenue)}</TableCell>
                  <TableCell className="text-right">{formatMoneyAmount(row.directCost)}</TableCell>
                  <TableCell className="text-right">{formatMoneyAmount(row.grossMargin)}</TableCell>
                  <TableCell className="text-right">
                    {row.grossMarginPct != null ? `${row.grossMarginPct}%` : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" asChild className="h-7 text-xs">
                      <Link href={`/proyectos/${row.projectId}/reportes/rentabilidad`}>Detalle</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow className="font-semibold">
                <TableCell colSpan={3}>
                  Consolidado{report.consolidatedCurrency ? ` (${report.consolidatedCurrency})` : ""}
                </TableCell>
                <TableCell className="text-right">
                  {formatMoneyAmount(report.consolidatedRevenue)}
                </TableCell>
                <TableCell className="text-right">
                  {formatMoneyAmount(report.consolidatedDirectCost)}
                </TableCell>
                <TableCell className="text-right">
                  {formatMoneyAmount(report.consolidatedGrossMargin)}
                </TableCell>
                <TableCell className="text-right">
                  {report.consolidatedGrossMarginPct != null
                    ? `${report.consolidatedGrossMarginPct}%`
                    : "—"}
                </TableCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          </Table>
        </TableScroll>
      )}
    </PageShell>
  );
}
