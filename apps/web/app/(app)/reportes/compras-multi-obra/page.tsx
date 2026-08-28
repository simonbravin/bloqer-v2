import Link from "next/link";
import { redirect } from "next/navigation";
import { getMultiProjectProcurementReport, ServiceError } from "@bloqer/services";
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
  searchParams: Promise<{ dateFrom?: string; dateTo?: string }>;
}

export default async function ComprasMultiObraPage({ searchParams }: PageProps) {
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
    report = await getMultiProjectProcurementReport(ctx, {
      dateFrom: sp.dateFrom,
      dateTo: sp.dateTo,
    });
  } catch (err) {
    if (err instanceof ServiceError && err.code === "FORBIDDEN") redirect("/reportes");
    throw err;
  }

  const top = report.topSuppliers.slice(0, 25);

  return (
    <PageShell variant="default" className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Compras multi-obra</h1>
          <p className="text-sm text-muted-foreground">
            Top proveedores (comprometido neto) y OC abiertas en todas las obras.
          </p>
        </div>
        <ReportExportActions exportPath="/api/reports/compras-multi-obra.csv" params={sp} />
      </div>

      <ReportSubnav>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/reportes">← Reportes</Link>
        </Button>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/proyectos">Ir a proyectos</Link>
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

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Top proveedores</h2>
        {top.length === 0 ? (
          <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
            Sin compras confirmadas en el período.
          </div>
        ) : (
          <TableScroll>
            <Table className="text-xs">
              <TableHeader>
                <TableRow>
                  <TableHead>Proveedor</TableHead>
                  <TableHead className="text-right">Comprometido</TableHead>
                  <TableHead className="text-right">Devengado</TableHead>
                  <TableHead className="text-right">Pagado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {top.map((row) => (
                  <TableRow key={row.supplierContactId}>
                    <TableCell className="font-medium">{row.supplierName}</TableCell>
                    <TableCell className="text-right">{formatMoneyAmount(row.committedCost)}</TableCell>
                    <TableCell className="text-right">{formatMoneyAmount(row.accruedCost)}</TableCell>
                    <TableCell className="text-right">{formatMoneyAmount(row.paidCost)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableScroll>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">OC abiertas (confirmadas / parciales)</h2>
        {report.openPurchaseOrders.length === 0 ? (
          <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
            No hay OC abiertas.
          </div>
        ) : (
          <TableScroll>
            <Table className="text-xs">
              <TableHeader>
                <TableRow>
                  <TableHead>Proyecto</TableHead>
                  <TableHead>OC</TableHead>
                  <TableHead>Proveedor</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.openPurchaseOrders.map((row) => (
                  <TableRow key={`${row.projectId}-${row.poNumber}`}>
                    <TableCell>
                      {row.projectId ? (
                        <Link
                          href={`/proyectos/${row.projectId}/reportes/compras-proveedores`}
                          className="hover:underline"
                        >
                          <span className="font-mono text-[10px]">{row.projectCode}</span>{" "}
                          {row.projectName}
                        </Link>
                      ) : (
                        row.projectName
                      )}
                    </TableCell>
                    <TableCell className="font-mono">{row.poNumber}</TableCell>
                    <TableCell>{row.supplierName}</TableCell>
                    <TableCell>{row.status}</TableCell>
                    <TableCell className="text-right">{formatMoneyAmount(row.totalAmount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableScroll>
        )}
      </section>
    </PageShell>
  );
}
