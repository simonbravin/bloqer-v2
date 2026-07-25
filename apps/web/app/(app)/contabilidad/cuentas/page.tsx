import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ListViewToggle } from "@/components/ui/list-view-toggle";
import {
  AccountingAccountListFilters,
  AccountingAccountListSection,
  ApplyCoaTemplateButton,
} from "@/features/accounting";
import { getCurrentUser } from "@/lib/auth";
import { buildTenantServiceContext } from "@/lib/tenant-service-context";
import { getCompanies, listAccountingAccounts } from "@bloqer/services";
import { can } from "@bloqer/domain";
import { companyQueryFilter, type EmpresaSearch } from "@/lib/accounting-search-params";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { ListEmptyState } from "@/components/ui/list-empty-state";

export default async function ContabilidadCuentasPage({
  searchParams,
}: {
  searchParams: Promise<EmpresaSearch & { q?: string }>;
}) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");
  if (!can(current.tenantCtx.roles, "VIEW", "ACCOUNTING")) redirect("/dashboard");

  const sp = await searchParams;
  const ctx = (await buildTenantServiceContext())!;
  const cf = companyQueryFilter(sp);
  const [{ data: accounts }, companies] = await Promise.all([
    listAccountingAccounts(ctx, cf),
    getCompanies(ctx),
  ]);

  const empresa = cf.companyId;
  const q = empresa ? `?empresa=${encodeURIComponent(empresa)}` : "";
  const canEdit = can(current.tenantCtx.roles, "EDIT", "ACCOUNTING");
  const search = sp.q?.trim().toLowerCase() ?? "";
  const filtered = search
    ? accounts.filter(
        (a) =>
          a.code.toLowerCase().includes(search) || a.name.toLowerCase().includes(search),
      )
    : accounts;

  // Same resolution order as services: query → membership → first ACTIVE by name.
  const applyCompanyId =
    empresa ?? current.tenantCtx.companyId ?? companies[0]?.id ?? null;
  const applyCompany = companies.find((c) => c.id === applyCompanyId) ?? null;
  const showCompanyHint =
    !empresa && !current.tenantCtx.companyId && companies.length > 1 && !!applyCompany;

  return (
    <PageShell variant="default" className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold tracking-tight">Plan de cuentas</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Suspense fallback={null}>
            <ListViewToggle />
          </Suspense>
          {canEdit && (
            <>
              <ApplyCoaTemplateButton
                companyId={applyCompanyId}
                companyLabel={showCompanyHint ? applyCompany?.name : null}
              />
              <Button asChild>
                <Link href={`/contabilidad/cuentas/nueva${q}`}>+ Nueva cuenta</Link>
              </Button>
            </>
          )}
        </div>
      </div>

      {accounts.length === 0 ? (
        <div className="rounded-md border border-dashed p-6 text-sm space-y-2">
          <p className="font-medium">Todavía no hay cuentas en esta empresa.</p>
          <p className="text-muted-foreground">
            Aplicá la plantilla AR (~40 cuentas + reglas default) o creá la primera cuenta a mano.
            Reaplicar la plantilla no duplica códigos existentes.
          </p>
          {canEdit ? (
            <p className="text-muted-foreground">
              Usá <span className="font-medium text-foreground">Aplicar plantilla AR</span> arriba a
              la derecha.
            </p>
          ) : null}
        </div>
      ) : (
        <>
          <Suspense fallback={null}>
            <AccountingAccountListFilters />
          </Suspense>
          {filtered.length === 0 ? (
            <ListEmptyState
              message={`Ninguna cuenta coincide con “${(sp.q ?? "").trim().slice(0, 64)}”.`}
            />
          ) : (
            <Suspense fallback={null}>
              <AccountingAccountListSection accounts={filtered} empresa={empresa} />
            </Suspense>
          )}
        </>
      )}
    </PageShell>
  );
}
