import { redirect, notFound } from "next/navigation";
import { AccountLedgerTable, AccountTypeBadge } from "@/features/accounting";
import { getCurrentUser } from "@/lib/auth";
import { buildTenantServiceContext } from "@/lib/tenant-service-context";
import { getAccountingAccountById, getAccountLedger } from "@bloqer/services";
import { can } from "@bloqer/domain";
import { listAccountLedgerSchema } from "@bloqer/validators";
import { companyQueryFilter, type EmpresaSearch } from "@/lib/accounting-search-params";
import { PageShell } from "@/components/layout/page-shell";
import { DataTableSection } from "@/components/ui/data-table-section";

export default async function CuentaContableDetallePage({
  params,
  searchParams,
}: {
  params: Promise<{ accountId: string }>;
  searchParams: Promise<EmpresaSearch>;
}) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");
  if (!can(current.tenantCtx.roles, "VIEW", "ACCOUNTING")) redirect("/dashboard");

  const { accountId } = await params;
  const sp = await searchParams;
  const ctx = (await buildTenantServiceContext())!;
  const cf = companyQueryFilter(sp);

  let account;
  try {
    account = await getAccountingAccountById(accountId, ctx, { companyId: cf.companyId ?? null });
  } catch {
    notFound();
  }

  const ledgerParsed = listAccountLedgerSchema.safeParse({
    accountId,
    companyId: cf.companyId ?? null,
    limit: 200,
  });
  const ledger = ledgerParsed.success ? await getAccountLedger(ctx, ledgerParsed.data) : [];

  const q = cf.companyId ? `?empresa=${encodeURIComponent(cf.companyId)}` : "";

  return (
    <PageShell variant="default" className="space-y-6" breadcrumbLabel={`${account.code} · ${account.name}`}>
      <div className="flex flex-wrap items-center gap-4">
        <h1 className="text-2xl font-bold tracking-tight font-mono">{account.code}</h1>
        <AccountTypeBadge type={account.type} />
      </div>
      <div className="rounded-lg border bg-card p-6 space-y-2">
        <h2 className="text-lg font-semibold">{account.name}</h2>
        {account.description && (
          <p className="text-sm text-muted-foreground">{account.description}</p>
        )}
        <p className="text-sm text-muted-foreground">{account.isActive ? "Activa" : "Inactiva"}</p>
      </div>
      <DataTableSection title="Mayor (solo contabilizado)">
        <AccountLedgerTable rows={ledger} />
      </DataTableSection>
    </PageShell>
  );
}
