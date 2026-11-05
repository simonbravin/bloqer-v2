import { redirect } from "next/navigation";
import { getTenantModuleGate, listSelectableTreasuryAccounts } from "@bloqer/services";
import { PageShell } from "@/components/layout/page-shell";
import { getCurrentUser } from "@/lib/auth";
import { BankReconciliationForm } from "@/features/treasury/components/bank-reconciliation-form";
import { canEditBankReconciliationUi } from "@/features/treasury/lib/treasury-edit-gates";

export default async function NuevaConciliacionPage() {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  if (!canEditBankReconciliationUi(ctx.roles)) {
    redirect("/tesoreria/conciliacion");
  }

  const gate = await getTenantModuleGate(ctx);
  if (!gate.isEnabled("BANK_RECONCILIATION")) redirect("/tesoreria/conciliacion");
  const active = (await listSelectableTreasuryAccounts(ctx)).map(({ id, name, currency }) => ({
    id, name, currency,
  }));

  return (
    <PageShell variant="default" className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Nueva conciliación</h1>
        <p className="text-sm text-muted-foreground">
          Definí cuenta, período y saldos del extracto. Luego cargá líneas y emparejá.
        </p>
      </div>
      <BankReconciliationForm accounts={active} />
    </PageShell>
  );
}
