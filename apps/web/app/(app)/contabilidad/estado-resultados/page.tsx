import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth";
import { buildTenantServiceContext } from "@/lib/tenant-service-context";
import { getIncomeStatement } from "@bloqer/services";
import { can } from "@bloqer/domain";
import { companyQueryFilter, type EmpresaSearch } from "@/lib/accounting-search-params";
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
import { accountingAccountHref } from "@/lib/accounting-query";

function PlSection({
  title,
  rows,
  dateFrom,
  dateTo,
  empresa,
}: {
  title: string;
  rows: { accountId: string | null; accountCode: string; accountName: string; balance: string }[];
  dateFrom: string;
  dateTo: string;
  empresa?: string;
}) {
  return (
    <DataTableSection title={title}>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground px-1 py-2">Sin movimientos.</p>
      ) : (
        <TableScroll>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Cuenta</TableHead>
                <TableHead className="text-right">Saldo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={`${r.accountId}-${r.accountCode}`}>
                  <TableCell className="font-mono text-sm">
                    {r.accountId ? (
                      <Link
                        href={accountingAccountHref(r.accountId, { dateFrom, dateTo, empresa })}
                        className="text-primary underline-offset-4 hover:underline"
                      >
                        {r.accountCode}
                      </Link>
                    ) : (
                      r.accountCode
                    )}
                  </TableCell>
                  <TableCell>{r.accountName}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{r.balance}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableScroll>
      )}
    </DataTableSection>
  );
}

export default async function EstadoResultadosPage({
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
  const report = await getIncomeStatement(ctx, {
    companyId: cf.companyId ?? null,
    dateFrom: sp.dateFrom,
    dateTo: sp.dateTo,
  });

  const exportParams: Record<string, string | undefined> = {
    dateFrom: report.dateFrom,
    dateTo: report.dateTo,
    empresa: cf.companyId,
  };
  const hasAny = report.currencies.some((c) => {
    const b = report.byCurrency[c]!;
    return b.income.length + b.expenses.length > 0;
  });

  return (
    <PageShell variant="default" className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Estado de resultados</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Período {report.dateFrom} — {report.dateTo}
          </p>
        </div>
        <ReportExportActions
          exportPath="/api/reports/contabilidad/estado-resultados"
          params={exportParams}
          pdf
          xlsx
        />
      </div>

      <AccountingGerencialDisclaimer />

      <div className="rounded-lg border bg-card p-4">
        <Suspense fallback={null}>
          <AccountingReportFilters />
        </Suspense>
      </div>

      {!hasAny ? (
        <ListEmptyState message="No hay ingresos ni gastos contabilizados en el período. Posteá borradores en Asientos." />
      ) : (
        report.currencies.map((currency) => {
          const block = report.byCurrency[currency]!;
          return (
            <div key={currency} className="space-y-4">
              <h2 className="text-lg font-semibold tracking-tight">{currency}</h2>
              <PlSection
                title="Ingresos"
                rows={block.income}
                dateFrom={report.dateFrom}
                dateTo={report.dateTo}
                empresa={cf.companyId}
              />
              <PlSection
                title="Gastos"
                rows={block.expenses}
                dateFrom={report.dateFrom}
                dateTo={report.dateTo}
                empresa={cf.companyId}
              />
              <div className="grid gap-2 sm:grid-cols-3 text-sm rounded-md border p-3">
                <div>
                  <p className="text-muted-foreground">Total ingresos</p>
                  <p className="font-mono font-medium">{block.totalIncome}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Total gastos</p>
                  <p className="font-mono font-medium">{block.totalExpenses}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Resultado</p>
                  <p className="font-mono font-medium">{block.netResult}</p>
                </div>
              </div>
            </div>
          );
        })
      )}
    </PageShell>
  );
}
