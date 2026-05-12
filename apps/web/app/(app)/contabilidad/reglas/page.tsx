import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { AccountingMappingRuleList } from "@/features/accounting";
import { getCurrentUser } from "@/lib/auth";
import { buildTenantServiceContext } from "@/lib/tenant-service-context";
import { listAccountingMappingRules } from "@bloqer/services";
import { can } from "@bloqer/domain";
import { companyQueryFilter, type EmpresaSearch } from "@/lib/accounting-search-params";

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
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/contabilidad">← Volver</Link>
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">Reglas contables</h1>
        </div>
        {can(current.tenantCtx.roles, "EDIT", "ACCOUNTING") && (
          <Button asChild><Link href={`/contabilidad/reglas/nueva${q}`}>+ Nueva regla</Link></Button>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        Mapeo debe/haber por tipo de evento operativo. Los asientos sugeridos se crean en borrador; la fase 11C puede enlazar botones desde cobranzas, pagos, tesorería e inventario.
      </p>
      <div className="rounded-lg border bg-card">
        <div className="border-b px-6 py-4">
          <h2 className="font-semibold">Reglas por empresa</h2>
        </div>
        <div className="p-6">
          <AccountingMappingRuleList rules={rules} empresa={empresa} />
        </div>
      </div>
    </div>
  );
}
