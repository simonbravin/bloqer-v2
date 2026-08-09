import Link from "next/link";
import { redirect } from "next/navigation";
import { can } from "@bloqer/domain";
import {
  getCompanies,
  getTenantModuleGate,
  listFinancialPeriods,
  ServiceError,
} from "@bloqer/services";
import { FinancialPeriodClosePanel } from "@/features/accounting/components/financial-period-close-panel";
import { PageShell } from "@/components/layout/page-shell";
import { PageListHeader } from "@/components/ui/page-list-header";
import { Button } from "@/components/ui/button";
import { ListEmptyState } from "@/components/ui/list-empty-state";
import { getCurrentUser } from "@/lib/auth";
import { buildTenantServiceContext } from "@/lib/tenant-service-context";
import { companyQueryFilter, type EmpresaSearch } from "@/lib/accounting-search-params";

export default async function ContabilidadCierresPage({
  searchParams,
}: {
  searchParams: Promise<EmpresaSearch>;
}) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const ctx = (await buildTenantServiceContext())!;
  const gate = await getTenantModuleGate(ctx);
  if (!gate.isEnabled("PERIOD_CLOSE") || !can(ctx.roles, "VIEW", "PERIOD_CLOSE")) {
    return (
      <PageShell variant="default" className="space-y-6">
        <PageListHeader
          title="Cierre de períodos"
          subtitle="Bloqueo mensual de tesorería y contabilidad"
        />
        <ListEmptyState
          title="Sin permisos para ver cierres"
          description={
            !gate.isEnabled("PERIOD_CLOSE")
              ? "El módulo de cierre de períodos no está habilitado para este tenant."
              : "Pedile a un administrador que te asigne el permiso de ver cierre de períodos."
          }
          action={
            <Button asChild size="sm" variant="outline">
              <Link href="/contabilidad">Volver a contabilidad</Link>
            </Button>
          }
        />
      </PageShell>
    );
  }

  const sp = await searchParams;
  const cf = companyQueryFilter(sp);
  const companies = await getCompanies(ctx);
  // Membership company wins (resolveAccountingCompanyId ignores ?empresa= when ctx.companyId is set).
  const companyId = ctx.companyId ?? cf.companyId ?? companies[0]?.id;
  const activeCompany = companies.find((c) => c.id === companyId) ?? null;
  // Only offer a picker when the actor is tenant-wide (no membership company lock).
  const showCompanyPicker = !ctx.companyId && companies.length > 1;

  if (!companyId) {
    return (
      <PageShell variant="default" className="space-y-6">
        <PageListHeader
          title="Cierre de períodos"
          subtitle="Bloqueo mensual de tesorería y contabilidad"
        />
        <p className="text-sm text-muted-foreground rounded-lg border bg-card p-4">
          Configurá al menos una empresa activa para cerrar períodos.
        </p>
      </PageShell>
    );
  }

  let periods: Awaited<ReturnType<typeof listFinancialPeriods>> = [];
  let loadError: string | null = null;
  try {
    periods = await listFinancialPeriods(companyId, ctx, { limit: 18 });
  } catch (err) {
    if (err instanceof ServiceError) loadError = err.message;
    else throw err;
  }

  const canOperate = can(ctx.roles, "APPROVE", "PERIOD_CLOSE");

  return (
    <PageShell variant="default" className="space-y-6">
      <PageListHeader
        title="Cierre de períodos"
        subtitle={
          <>
            Bloqueo mensual de tesorería y asientos contables
            {activeCompany ? (
              <>
                {" · "}
                <span className="font-medium text-foreground">{activeCompany.name}</span>
              </>
            ) : null}
          </>
        }
      />

      {showCompanyPicker ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 px-4 py-3 text-sm">
          <span className="text-muted-foreground">Empresa:</span>
          {companies.map((c) => (
            <Button
              key={c.id}
              asChild
              size="sm"
              variant={c.id === companyId ? "default" : "outline"}
            >
              <Link href={`/contabilidad/cierres?empresa=${encodeURIComponent(c.id)}`}>
                {c.name}
              </Link>
            </Button>
          ))}
        </div>
      ) : null}

      {loadError ? (
        <p className="text-sm text-destructive" role="alert">
          {loadError}
        </p>
      ) : (
        <FinancialPeriodClosePanel
          companyId={companyId}
          companyName={activeCompany?.name ?? null}
          periods={periods}
          canOperate={canOperate}
        />
      )}
    </PageShell>
  );
}
