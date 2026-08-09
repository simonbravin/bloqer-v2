import { redirect } from "next/navigation";
import { TreasuryAccountForm } from "@/features/treasury";
import { canEditBankAccountsUi } from "@/features/treasury/lib/treasury-edit-gates";
import { getCurrentUser } from "@/lib/auth";
import { PageShell } from "@/components/layout/page-shell";

export default async function NuevaCuentaPage() {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");
  if (!canEditBankAccountsUi(current.tenantCtx.roles)) {
    redirect("/tesoreria/cuentas");
  }

  return (
    <PageShell variant="default" className="space-y-6">
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Nueva cuenta</h1>
      </div>

      <TreasuryAccountForm />
    </PageShell>
  );
}
