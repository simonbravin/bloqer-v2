import { redirect, notFound } from "next/navigation";
import { Suspense } from "react";
import { AccountLedgerTable, AccountTypeBadge } from "@/features/accounting";
import { getCurrentUser } from "@/lib/auth";
import { buildTenantServiceContext } from "@/lib/tenant-service-context";
import {
  defaultAccountingMonthRange,
  getAccountingAccountById,
  getAccountLedger,
  parseAccountingDateRange,
  ServiceError,
} from "@bloqer/services";
import { can } from "@bloqer/domain";
import { companyQueryFilter, type EmpresaSearch } from "@/lib/accounting-search-params";
import { PageShell } from "@/components/layout/page-shell";
import { DataTableSection } from "@/components/ui/data-table-section";
import { ReportExportActions } from "@/features/reports";
import { AccountingReportFilters } from "@/features/accounting/components/accounting-report-filters";
import { AccountingGerencialDisclaimer } from "@/features/accounting/components/accounting-gerencial-disclaimer";

export default async function CuentaContableDetallePage({
  params,
  searchParams,
}: {
  params: Promise<{ accountId: string }>;
  searchParams: Promise<EmpresaSearch & { dateFrom?: string; dateTo?: string }>;
}) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");
  if (!can(current.tenantCtx.roles, "VIEW", "ACCOUNTING")) redirect("/dashboard");

  const { accountId } = await params;
  const sp = await searchParams;
  const ctx = (await buildTenantServiceContext())!;
  const cf = companyQueryFilter(sp);

  let range;
  try {
    range = parseAccountingDateRange({ dateFrom: sp.dateFrom, dateTo: sp.dateTo });
  } catch (e) {
    if (e instanceof ServiceError && e.code === "VALIDATION") {
      range = defaultAccountingMonthRange();
    } else {
      throw e;
    }
  }

  let account;
  try {
    account = await getAccountingAccountById(accountId, ctx, { companyId: cf.companyId ?? null });
  } catch {
    notFound();
  }

  const ledger = await getAccountLedger(ctx, {
    accountId,
    companyId: cf.companyId ?? null,
    dateFrom: range.dateFrom,
    dateTo: range.dateTo,
    limit: 2000,
  });

  const exportParams: Record<string, string | undefined> = {
    accountId,
    dateFrom: range.dateFrom,
    dateTo: range.dateTo,
    empresa: cf.companyId,
  };

  return (
    <PageShell variant="default" className="space-y-6" breadcrumbLabel={`${account.code} · ${account.name}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-4">
            <h1 className="text-2xl font-bold tracking-tight font-mono">{account.code}</h1>
            <AccountTypeBadge type={account.type} />
          </div>
          <p className="text-sm text-muted-foreground">
            Mayor · {range.dateFrom} — {range.dateTo}
          </p>
        </div>
        <ReportExportActions
          exportPath="/api/reports/contabilidad/mayor"
          params={exportParams}
          pdf
        />
      </div>

      <AccountingGerencialDisclaimer />

      <div className="rounded-lg border bg-card p-6 space-y-2">
        <h2 className="text-lg font-semibold">{account.name}</h2>
        {account.description && (
          <p className="text-sm text-muted-foreground">{account.description}</p>
        )}
        <p className="text-sm text-muted-foreground">{account.isActive ? "Activa" : "Inactiva"}</p>
      </div>

      <div className="rounded-lg border bg-card p-4">
        <Suspense fallback={null}>
          <AccountingReportFilters />
        </Suspense>
      </div>

      <DataTableSection title="Mayor (solo contabilizado)">
        <AccountLedgerTable rows={ledger.rows} truncated={ledger.truncated} />
      </DataTableSection>
    </PageShell>
  );
}
