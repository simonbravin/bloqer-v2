import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth";
import { buildTenantServiceContext } from "@/lib/tenant-service-context";
import { getTrialBalanceReport, ServiceError } from "@bloqer/services";
import { can } from "@bloqer/domain";
import { companyQueryFilter, type EmpresaSearch } from "@/lib/accounting-search-params";
import { accountingAccountHref } from "@/lib/accounting-query";
import { PageShell } from "@/components/layout/page-shell";
import { DataTableSection } from "@/components/ui/data-table-section";
import { TableScroll } from "@/components/ui/table-scroll";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ListEmptyState } from "@/components/ui/list-empty-state";
import { ReportExportActions } from "@/features/reports";
import { AccountingReportFilters } from "@/features/accounting/components/accounting-report-filters";
import { AccountingGerencialDisclaimer } from "@/features/accounting/components/accounting-gerencial-disclaimer";
import { formatMoneyAmount } from "@/lib/format-money";

export default async function TrialBalancePage({
  searchParams,
}: {
  searchParams: Promise<EmpresaSearch & { dateFrom?: string; dateTo?: string }>;
}) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");
  if (!can(current.tenantCtx.roles, "VIEW", "ACCOUNTING")) redirect("/dashboard");

  const sp = await searchParams;
  const ctx = (await buildTenantServiceContext())!;
  const cf = companyQueryFilter(sp);

  let report;
  let rangeError: string | null = null;
  try {
    report = await getTrialBalanceReport(ctx, {
      companyId: cf.companyId ?? null,
      dateFrom: sp.dateFrom,
      dateTo: sp.dateTo,
    });
  } catch (e) {
    if (e instanceof ServiceError && e.code === "VALIDATION") {
      rangeError = e.message;
      report = await getTrialBalanceReport(ctx, { companyId: cf.companyId ?? null });
    } else {
      throw e;
    }
  }

  const exportParams: Record<string, string | undefined> = {
    dateFrom: report.dateFrom,
    dateTo: report.dateTo,
    empresa: cf.companyId,
  };

  return (
    <PageShell variant="default" className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Sumas y saldos</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Período {report.dateFrom} — {report.dateTo}. Solo asientos contabilizados.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ReportExportActions
            exportPath="/api/reports/contabilidad/sumas-y-saldos"
            params={exportParams}
            pdf
            xlsx
          />
          <Link
            href="/contabilidad/asientos"
            className="text-sm text-primary underline-offset-4 hover:underline"
          >
            Ver asientos
          </Link>
        </div>
      </div>

      <AccountingGerencialDisclaimer />
      {rangeError ? (
        <p className="text-sm text-amber-700 dark:text-amber-400 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2">
          {rangeError} Se muestra el mes corriente.
        </p>
      ) : null}

      <div className="rounded-lg border bg-card p-4">
        <Suspense fallback={null}>
          <AccountingReportFilters />
        </Suspense>
      </div>

      <p className="text-sm text-muted-foreground">
        {report.rows.length} cuenta{report.rows.length === 1 ? "" : "s"} con movimiento.
      </p>

      <DataTableSection title="Balance">
        {report.rows.length === 0 ? (
          <ListEmptyState message="No hay asientos contabilizados en el período. Posteá borradores en Asientos." />
        ) : (
          <TableScroll>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Cuenta</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Moneda</TableHead>
                  <TableHead className="text-right">Debe</TableHead>
                  <TableHead className="text-right">Haber</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.rows.map((r) => (
                  <TableRow key={`${r.accountId}-${r.currency}`}>
                    <TableCell className="font-mono text-sm">
                      <Link
                        href={accountingAccountHref(r.accountId, {
                          dateFrom: report.dateFrom,
                          dateTo: report.dateTo,
                          empresa: cf.companyId,
                        })}
                        className="text-primary underline-offset-4 hover:underline"
                      >
                        {r.accountCode}
                      </Link>
                    </TableCell>
                    <TableCell>{r.accountName}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{r.accountType}</TableCell>
                    <TableCell>{r.currency}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{formatMoneyAmount(r.debit)}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{formatMoneyAmount(r.credit)}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{formatMoneyAmount(r.balance)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableScroll>
        )}
      </DataTableSection>
    </PageShell>
  );
}
