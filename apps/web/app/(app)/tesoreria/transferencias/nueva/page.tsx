import { redirect } from "next/navigation";
import { InternalTransferForm } from "@/features/treasury";
import { getCurrentUser } from "@/lib/auth";
import { listTreasuryAccounts } from "@bloqer/services";
import { PageShell } from "@/components/layout/page-shell";
import { PageBackLink } from "@/components/layout/page-back-link";

export default async function NuevaTransferenciaPage() {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  const { data: allAccounts } = await listTreasuryAccounts(ctx);
  const activeAccounts = allAccounts
    .filter((a) => a.status === "ACTIVE")
    .map((a) => ({ id: a.id, name: a.name, currency: a.currency }));

  return (
    <PageShell variant="form" className="space-y-6">
      <div className="flex items-center gap-4">
        <PageBackLink href="/tesoreria/transferencias" label="Volver" />
        <h1 className="text-2xl font-bold tracking-tight">Nueva transferencia</h1>
      </div>

      {activeAccounts.length < 2 ? (
        <div className="rounded-lg border bg-card p-6">
          <p className="text-sm text-muted-foreground">
            Se necesitan al menos dos cuentas activas para realizar una transferencia.
          </p>
        </div>
      ) : (
        <InternalTransferForm accounts={activeAccounts} />
      )}
    </PageShell>
  );
}
