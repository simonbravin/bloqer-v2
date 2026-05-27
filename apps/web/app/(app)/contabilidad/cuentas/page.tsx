import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ListViewToggle } from "@/components/ui/list-view-toggle";
import { AccountingAccountListSection } from "@/features/accounting";
import { getCurrentUser } from "@/lib/auth";
import { buildTenantServiceContext } from "@/lib/tenant-service-context";
import { listAccountingAccounts } from "@bloqer/services";
import { can } from "@bloqer/domain";
import { companyQueryFilter, type EmpresaSearch } from "@/lib/accounting-search-params";
import { PageShell } from "@/components/layout/page-shell";
import { PageBackLink } from "@/components/layout/page-back-link";
import { Button } from "@/components/ui/button";

export default async function ContabilidadCuentasPage({
  searchParams,
}: {
  searchParams: Promise<EmpresaSearch>;
}) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");
  if (!can(current.tenantCtx.roles, "VIEW", "ACCOUNTING")) redirect("/dashboard");

  const sp = await searchParams;
  const ctx = (await buildTenantServiceContext())!;
  const cf = companyQueryFilter(sp);
  const { data: accounts } = await listAccountingAccounts(ctx, cf);

  const empresa = cf.companyId;
  const q = empresa ? `?empresa=${encodeURIComponent(empresa)}` : "";

  return (
    <PageShell variant="default" className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <PageBackLink href="/contabilidad" label="Volver" />
          <h1 className="text-2xl font-bold tracking-tight">Plan de cuentas</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Suspense fallback={null}>
            <ListViewToggle />
          </Suspense>
          {can(current.tenantCtx.roles, "EDIT", "ACCOUNTING") && (
            <Button asChild>
              <Link href={`/contabilidad/cuentas/nueva${q}`}>+ Nueva cuenta</Link>
            </Button>
          )}
        </div>
      </div>

      <Suspense fallback={null}>
        <AccountingAccountListSection accounts={accounts} empresa={empresa} />
      </Suspense>
    </PageShell>
  );
}
