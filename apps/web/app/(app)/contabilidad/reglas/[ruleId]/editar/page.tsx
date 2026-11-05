import { redirect, notFound } from "next/navigation";
import { AccountingMappingRuleForm } from "@/features/accounting";
import { getCurrentUser } from "@/lib/auth";
import { requireAccountingPageCompany } from "@/lib/accounting-page-company";
import { getAccountingMappingRuleById, listAccountingAccounts } from "@bloqer/services";
import { can } from "@bloqer/domain";
import type { EmpresaSearch } from "@/lib/accounting-search-params";
import { PageShell } from "@/components/layout/page-shell";

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
  const { ctx, cf } = await requireAccountingPageCompany(sp);

  let rule;
  try {
    rule = await getAccountingMappingRuleById(ruleId, ctx, { companyId: cf.companyId ?? null });
  } catch {
    notFound();
  }

  const { data: accounts } = await listAccountingAccounts(ctx, { companyId: rule.companyId });
  const picks = accounts.map((a) => ({ id: a.id, code: a.code, name: a.name }));

  return (
    <PageShell variant="form" className="space-y-6" breadcrumbLabel={rule.name}>
      <div className="flex items-center gap-4">
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
