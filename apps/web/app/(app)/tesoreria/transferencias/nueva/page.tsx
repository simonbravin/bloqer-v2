import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { InternalTransferForm } from "@/features/treasury";
import { getCurrentUser } from "@/lib/auth";
import { listTreasuryAccounts } from "@bloqer/services";

export default async function NuevaTransferenciaPage() {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId:    current.tenantCtx.tenantId,
    companyId:   current.tenantCtx.companyId,
    roles:       current.tenantCtx.roles,
  };

  const allAccounts = await listTreasuryAccounts(ctx);
  const activeAccounts = allAccounts
    .filter((a) => a.status === "ACTIVE")
    .map((a) => ({ id: a.id, name: a.name, currency: a.currency }));

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/tesoreria/transferencias">← Volver</Link>
        </Button>
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
    </div>
  );
}
