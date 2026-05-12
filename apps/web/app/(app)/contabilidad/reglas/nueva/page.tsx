import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { AccountingMappingRuleForm } from "@/features/accounting";
import { getCurrentUser } from "@/lib/auth";
import { buildTenantServiceContext } from "@/lib/tenant-service-context";
import { listAccountingAccounts } from "@bloqer/services";
import { can } from "@bloqer/domain";
import { companyQueryFilter, type EmpresaSearch } from "@/lib/accounting-search-params";

export default async function NuevaReglaContablePage({
  searchParams,
}: {
  searchParams: Promise<EmpresaSearch>;
}) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");
  if (!can(current.tenantCtx.roles, "EDIT", "ACCOUNTING")) redirect("/dashboard");

  const sp = await searchParams;
  const ctx = (await buildTenantServiceContext())!;
  const cf = companyQueryFilter(sp);
  const accounts = await listAccountingAccounts(ctx, cf);
  const picks = accounts.map((a) => ({ id: a.id, code: a.code, name: a.name }));

  const empresa = cf.companyId;
  const q = empresa ? `?empresa=${encodeURIComponent(empresa)}` : "";
  const defaultCompanyId =
    current.tenantCtx.companyId ?? cf.companyId ?? null;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/contabilidad/reglas${q}`}>← Volver</Link>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">Nueva regla contable</h1>
      </div>
      <AccountingMappingRuleForm
        mode="create"
        accounts={picks}
        defaultCompanyId={defaultCompanyId}
      />
    </div>
  );
}
