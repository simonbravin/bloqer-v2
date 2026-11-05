import { redirect } from "next/navigation";
import { AccountingAccountForm } from "@/features/accounting";
import { getCurrentUser } from "@/lib/auth";
import { requireAccountingPageCompany } from "@/lib/accounting-page-company";
import { listAccountingAccounts } from "@bloqer/services";
import { can } from "@bloqer/domain";
import type { EmpresaSearch } from "@/lib/accounting-search-params";
import { PageShell } from "@/components/layout/page-shell";

export default async function NuevaCuentaContablePage({
  searchParams,
}: {
  searchParams: Promise<EmpresaSearch>;
}) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");
  if (!can(current.tenantCtx.roles, "EDIT", "ACCOUNTING")) redirect("/dashboard");

  const { ctx, cf } = await requireAccountingPageCompany(await searchParams);
  const { data: existingAccounts } = await listAccountingAccounts(ctx, cf);

  return (
    <PageShell variant="default" className="space-y-6">
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Nueva cuenta contable</h1>
      </div>
      <AccountingAccountForm
        defaultCompanyId={cf.companyId}
        existingAccounts={existingAccounts}
      />
    </PageShell>
  );
}
