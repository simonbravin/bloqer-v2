import { redirect, notFound } from "next/navigation";
import { AccountingMappingRuleForm } from "@/features/accounting";
import { getCurrentUser } from "@/lib/auth";
import { buildTenantServiceContext } from "@/lib/tenant-service-context";
import { getAccountingMappingRuleById, listAccountingAccounts } from "@bloqer/services";
import { can } from "@bloqer/domain";
import { companyQueryFilter, type EmpresaSearch } from "@/lib/accounting-search-params";
import { PageShell } from "@/components/layout/page-shell";
import { PageBackLink } from "@/components/layout/page-back-link";

export default async function EditarReglaContablePage({
  params,
  searchParams,
}: {
  params: Promise<{ ruleId: string }>;
  searchParams: Promise<EmpresaSearch>;
}) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");
  if (!can(current.tenantCtx.roles, "EDIT", "ACCOUNTING")) redirect("/dashboard");

  const { ruleId } = await params;
  const sp = await searchParams;
  const ctx = (await buildTenantServiceContext())!;
  const cf = companyQueryFilter(sp);

  let rule;
  try {
    rule = await getAccountingMappingRuleById(ruleId, ctx, { companyId: cf.companyId ?? null });
  } catch {
    notFound();
  }

  const { data: accounts } = await listAccountingAccounts(ctx, { companyId: rule.companyId });
  const picks = accounts.map((a) => ({ id: a.id, code: a.code, name: a.name }));

  const q = cf.companyId ? `?empresa=${encodeURIComponent(cf.companyId)}` : "";

  return (
    <PageShell variant="form" className="space-y-6">
      <div className="flex items-center gap-4">
        <PageBackLink href={`/contabilidad/reglas/${ruleId}${q}`} label="Volver" />
        <h1 className="text-2xl font-bold tracking-tight">Editar regla</h1>
      </div>
      <AccountingMappingRuleForm
        mode="edit"
        ruleId={ruleId}
        initial={rule}
        accounts={picks}
        defaultCompanyId={rule.companyId}
      />
    </PageShell>
  );
}
