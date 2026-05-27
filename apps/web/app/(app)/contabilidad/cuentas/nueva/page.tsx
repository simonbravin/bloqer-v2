import { redirect } from "next/navigation";
import { AccountingAccountForm } from "@/features/accounting";
import { getCurrentUser } from "@/lib/auth";
import { buildTenantServiceContext } from "@/lib/tenant-service-context";
import { getCompanies } from "@bloqer/services";
import { can } from "@bloqer/domain";
import { PageShell } from "@/components/layout/page-shell";
import { PageBackLink } from "@/components/layout/page-back-link";

export default async function NuevaCuentaContablePage() {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");
  if (!can(current.tenantCtx.roles, "EDIT", "ACCOUNTING")) redirect("/dashboard");

  const ctx = (await buildTenantServiceContext())!;
  const companies = await getCompanies(ctx);

  return (
    <PageShell variant="form" className="space-y-6">
      <div className="flex items-center gap-4">
        <PageBackLink href="/contabilidad/cuentas" label="Volver" />
        <h1 className="text-2xl font-bold tracking-tight">Nueva cuenta contable</h1>
      </div>
      <AccountingAccountForm
        companies={companies.map((c) => ({ id: c.id, name: c.name }))}
        defaultCompanyId={current.tenantCtx.companyId}
      />
    </PageShell>
  );
}
