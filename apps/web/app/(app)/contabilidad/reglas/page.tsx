import Link from "next/link";
import { redirect } from "next/navigation";
import { AccountingMappingRuleList } from "@/features/accounting";
import { getCurrentUser } from "@/lib/auth";
import { buildTenantServiceContext } from "@/lib/tenant-service-context";
import { listAccountingMappingRules } from "@bloqer/services";
import { can } from "@bloqer/domain";
import { companyQueryFilter, type EmpresaSearch } from "@/lib/accounting-search-params";
import { PageShell } from "@/components/layout/page-shell";
import { PageBackLink } from "@/components/layout/page-back-link";
import { Button } from "@/components/ui/button";

export default async function ContabilidadReglasPage({
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
  const rules = await listAccountingMappingRules(ctx, cf);

  const empresa = cf.companyId;
  const q = empresa ? `?empresa=${encodeURIComponent(empresa)}` : "";

  return (
    <PageShell variant="default" className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <PageBackLink href="/contabilidad" label="Volver" />
          <h1 className="text-2xl font-bold tracking-tight">Reglas contables</h1>
        </div>
        {can(current.tenantCtx.roles, "EDIT", "ACCOUNTING") && (
          <Button asChild>
            <Link href={`/contabilidad/reglas/nueva${q}`}>+ Nueva regla</Link>
          </Button>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        Mapeo debe/haber por tipo de evento operativo. Los asientos sugeridos se crean en borrador;
        la fase 11C puede enlazar botones desde cobranzas, pagos, tesorería e inventario.
      </p>
      <AccountingMappingRuleList rules={rules} empresa={empresa} />
    </PageShell>
  );
}
