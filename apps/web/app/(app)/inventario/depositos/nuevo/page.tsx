import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { resolveActiveCompanyId } from "@bloqer/services";
import { WarehouseForm } from "@/features/inventory";
import { PageShell } from "@/components/layout/page-shell";

export default async function NuevoDepositoPage() {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };
  const companyId = await resolveActiveCompanyId(ctx);

  return (
    <PageShell variant="default" className="space-y-6">
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Nuevo depósito</h1>
      </div>

      {companyId ? (
        <div className="rounded-lg border bg-card p-6">
          <WarehouseForm companyId={companyId} />
        </div>
      ) : (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
          No hay una empresa activa en el tenant. Creá o activá una empresa antes de dar de alta depósitos.
        </p>
      )}
    </PageShell>
  );
}
