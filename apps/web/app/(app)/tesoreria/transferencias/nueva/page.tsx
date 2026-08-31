import { redirect } from "next/navigation";
import { InternalTransferForm } from "@/features/treasury";
import { canEditInternalTransfersUi } from "@/features/treasury/lib/treasury-edit-gates";
import { getCurrentUser } from "@/lib/auth";
import { listTreasuryAccounts } from "@bloqer/services";
import { PageShell } from "@/components/layout/page-shell";

export default async function NuevaTransferenciaPage({
  searchParams,
}: {
  searchParams: Promise<{ fromAccountId?: string; returnTo?: string }>;
}) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");
  if (!canEditInternalTransfersUi(current.tenantCtx.roles)) {
    redirect("/tesoreria/cuentas");
  }

  const sp = await searchParams;
  const fromAccountId = sp.fromAccountId?.trim() || undefined;
  /** Only override redirect when opened from historial; otherwise form uses the actual source. */
  const successHref = sp.returnTo === "historial" ? "/tesoreria/transferencias" : undefined;

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
    <PageShell variant="default" className="space-y-6">
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Nueva transferencia</h1>
      </div>

      {activeAccounts.length < 2 ? (
        <div className="rounded-lg border bg-card p-6">
          <p className="text-sm text-muted-foreground">
            Se necesitan al menos dos cuentas activas para realizar una transferencia.
          </p>
        </div>
      ) : (
        <InternalTransferForm
          accounts={activeAccounts}
          defaultSourceAccountId={fromAccountId}
          successHref={successHref}
        />
      )}
    </PageShell>
  );
}
