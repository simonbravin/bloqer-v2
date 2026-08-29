import Link from "next/link";
import { redirect } from "next/navigation";
import { getOverheadByProjectReport, ServiceError } from "@bloqer/services";
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

interface PageProps {
  searchParams: Promise<{ periodFrom?: string; periodTo?: string }>;
}

export default async function GastosGeneralesPorProyectoPage({ searchParams }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const sp = await searchParams;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  let report;
  try {
    report = await getOverheadByProjectReport(ctx, {
      periodFrom: sp.periodFrom,
      periodTo: sp.periodTo,
    });
  } catch (err) {
    if (err instanceof ServiceError && err.code === "FORBIDDEN") redirect("/reportes");
    throw err;
  }

  return (
    <PageShell variant="default" className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Gastos generales por proyecto</h1>
          <p className="text-sm text-muted-foreground">
            Imputaciones manuales de GG por obra y período (YYYY-MM).
          </p>
        </div>
        <ReportExportActions
          exportPath="/api/reports/gastos-generales-por-proyecto.csv"
          params={sp}
          pdf
          xlsx
        />
      </div>

      <ReportSubnav>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/reportes">← Reportes</Link>
        </Button>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/finanzas/gastos-generales">Ver imputación GG</Link>
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
          Sin imputaciones. Cargá GG en Finanzas → Imputación GG.
        </div>
      ) : (
        <TableScroll>
          <Table className="text-xs">
            <TableHeader>
              <TableRow>
                <TableHead>Período</TableHead>
                <TableHead>Código</TableHead>
                <TableHead>Proyecto</TableHead>
                <TableHead>Moneda</TableHead>
                <TableHead className="text-right">Monto</TableHead>
                <TableHead>Notas</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.rows.map((row, i) => (
                <TableRow key={`${row.projectId}-${row.period}-${i}`}>
                  <TableCell className="font-mono">{row.period}</TableCell>
                  <TableCell className="font-mono">{row.projectCode}</TableCell>
                  <TableCell>
                    <Link
                      href={`/proyectos/${row.projectId}/reportes/rentabilidad`}
                      className="hover:underline"
                    >
                      {row.projectName}
                    </Link>
                  </TableCell>
                  <TableCell>{row.currency}</TableCell>
                  <TableCell className="text-right">{formatMoneyAmount(row.amount)}</TableCell>
                  <TableCell className="text-muted-foreground max-w-48 truncate">
                    {row.notes ?? "—"}
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
