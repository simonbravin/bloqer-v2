import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth";
import { buildTenantServiceContext } from "@/lib/tenant-service-context";
import { getStatementOfFinancialPosition } from "@bloqer/services";
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

function SectionTable({
  title,
  rows,
  empresa,
}: {
  title: string;
  rows: { accountId: string | null; accountCode: string; accountName: string; balance: string; synthetic?: boolean }[];
  empresa?: string;
}) {
  if (rows.length === 0) {
    return (
      <DataTableSection title={title}>
        <p className="text-sm text-muted-foreground px-1 py-2">Sin saldos en esta sección.</p>
      </DataTableSection>
    );
  }
  return (
    <DataTableSection title={title}>
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
              <TableRow key={`${r.accountId ?? r.accountName}-${r.accountCode}`}>
                <TableCell className="font-mono text-sm">
                  {r.accountId ? (
                    <Link
                      href={accountingAccountHref(r.accountId, { empresa })}
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      {r.accountCode}
                    </Link>
                  ) : (
                    r.accountCode
                  )}
                </TableCell>
                <TableCell className={r.synthetic ? "italic text-muted-foreground" : undefined}>
                  {r.accountName}
                </TableCell>
                <TableCell className="text-right font-mono text-sm">{r.balance}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableScroll>
    </DataTableSection>
  );
}

export default async function SituacionPatrimonialPage({
  searchParams,
}: {
  searchParams: Promise<EmpresaSearch & { asOfDate?: string }>;
}) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");
  if (!can(current.tenantCtx.roles, "VIEW", "ACCOUNTING")) redirect("/dashboard");

  const sp = await searchParams;
  const ctx = (await buildTenantServiceContext())!;
  const cf = companyQueryFilter(sp);
  const report = await getStatementOfFinancialPosition(ctx, {
    companyId: cf.companyId ?? null,
    asOfDate: sp.asOfDate,
  });

  const exportParams: Record<string, string | undefined> = {
    asOfDate: report.asOfDate,
    empresa: cf.companyId,
  };
  const hasAny =
    report.currencies.some((c) => {
      const b = report.byCurrency[c]!;
      return b.assets.length + b.liabilities.length + b.equity.length > 0;
    });

  return (
    <PageShell variant="default" className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Situación patrimonial</h1>
          <p className="text-sm text-muted-foreground mt-1">Al {report.asOfDate}</p>
        </div>
        <ReportExportActions
          exportPath="/api/reports/contabilidad/estado-situacion"
          params={exportParams}
          pdf
          xlsx
        />
      </div>

      <AccountingGerencialDisclaimer />

      <div className="rounded-lg border bg-card p-4">
        <Suspense fallback={null}>
          <AccountingReportFilters asOf />
        </Suspense>
      </div>

      {!hasAny ? (
        <ListEmptyState message="No hay asientos contabilizados al corte. Posteá borradores en Asientos." />
      ) : (
        report.currencies.map((currency) => {
          const block = report.byCurrency[currency]!;
          return (
            <div key={currency} className="space-y-4">
              <h2 className="text-lg font-semibold tracking-tight">{currency}</h2>
              {!block.balanced ? (
                <p className="text-sm text-amber-700 dark:text-amber-400 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2">
                  Activo ({block.totalAssets}) no cuadra con Pasivo + PN ({block.totalLiabilities} +{" "}
                  {block.totalEquity}). Revisá asientos o monedas.
                </p>
              ) : null}
              <SectionTable title="Activo" rows={block.assets} empresa={cf.companyId} />
              <SectionTable title="Pasivo" rows={block.liabilities} empresa={cf.companyId} />
              <SectionTable title="Patrimonio neto" rows={block.equity} empresa={cf.companyId} />
              <div className="grid gap-2 sm:grid-cols-3 text-sm rounded-md border p-3">
                <div>
                  <p className="text-muted-foreground">Total activo</p>
                  <p className="font-mono font-medium">{block.totalAssets}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Total pasivo</p>
                  <p className="font-mono font-medium">{block.totalLiabilities}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Total patrimonio</p>
                  <p className="font-mono font-medium">{block.totalEquity}</p>
                </div>
              </div>
            </div>
          );
        })
      )}
    </PageShell>
  );
}
