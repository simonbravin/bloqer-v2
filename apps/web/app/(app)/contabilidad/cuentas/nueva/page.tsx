import { redirect } from "next/navigation";
import { AccountingAccountForm } from "@/features/accounting";
import { getCurrentUser } from "@/lib/auth";
import { buildTenantServiceContext } from "@/lib/tenant-service-context";
import { getCompanies, listAccountingAccounts } from "@bloqer/services";
import { can } from "@bloqer/domain";
import { companyQueryFilter, type EmpresaSearch } from "@/lib/accounting-search-params";
import { PageShell } from "@/components/layout/page-shell";

export default async function NuevaCuentaContablePage({
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
  const companies = await getCompanies(ctx);

  // Membership company wins on create (resolveAccountingCompanyId ignores input).
  const membershipCompanyId = current.tenantCtx.companyId;
  const companiesForForm = membershipCompanyId
    ? companies.filter((c) => c.id === membershipCompanyId)
    : companies;
  const defaultCompanyId =
    membershipCompanyId ??
    cf.companyId ??
    companiesForForm[0]?.id ??
    null;

  const existingAccounts = (
    await Promise.all(
      companiesForForm.map(async (c) => {
        const { data } = await listAccountingAccounts(ctx, { companyId: c.id });
        return data.map((a) => ({
          id: a.id,
          code: a.code,
          name: a.name,
          type: a.type,
          companyId: c.id,
          isActive: a.isActive,
        }));
      }),
    )
  ).flat();

  return (
    <PageShell variant="default" className="space-y-6">
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Nueva cuenta contable</h1>
      </div>
      <AccountingAccountForm
        companies={companiesForForm.map((c) => ({ id: c.id, name: c.name }))}
        defaultCompanyId={defaultCompanyId}
        existingAccounts={existingAccounts}
      />
    </PageShell>
  );
}
