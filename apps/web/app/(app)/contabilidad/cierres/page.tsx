import Link from "next/link";
import { redirect } from "next/navigation";
import { can } from "@bloqer/domain";
import {
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
import { accountingPageCompany } from "@/lib/accounting-page-company";
import type { EmpresaSearch } from "@/lib/accounting-search-params";

export default async function ContabilidadCierresPage({
  searchParams,
}: {
  searchParams: Promise<EmpresaSearch>;
}) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { ctx, companies, company: activeCompany } = await accountingPageCompany(await searchParams);
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

  if (!activeCompany) {
    return (
      <PageShell variant="default" className="space-y-6">
        <PageListHeader
          title="Cierre de períodos"
          subtitle="Bloqueo mensual de tesorería y contabilidad"
        />
        <p className="text-sm text-muted-foreground rounded-lg border bg-card p-4">
          {companies.length > 1 ? "Elegí una empresa arriba para revisar sus períodos." : "Configurá una empresa activa para cerrar períodos."}
        </p>
      </PageShell>
    );
  }
  const companyId = activeCompany.id;

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
