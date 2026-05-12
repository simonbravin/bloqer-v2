import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { AccountingAccountForm } from "@/features/accounting";
import { getCurrentUser } from "@/lib/auth";
import { buildTenantServiceContext } from "@/lib/tenant-service-context";
import { getCompanies } from "@bloqer/services";
import { can } from "@bloqer/domain";

export default async function NuevaCuentaContablePage() {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");
  if (!can(current.tenantCtx.roles, "EDIT", "ACCOUNTING")) redirect("/dashboard");

  const ctx = (await buildTenantServiceContext())!;
  const companies = await getCompanies(ctx);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/contabilidad/cuentas">← Volver</Link>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">Nueva cuenta contable</h1>
      </div>
      <AccountingAccountForm
        companies={companies.map((c) => ({ id: c.id, name: c.name }))}
        defaultCompanyId={current.tenantCtx.companyId}
      />
    </div>
  );
}
