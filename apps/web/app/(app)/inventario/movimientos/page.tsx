import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listStockMovements } from "@bloqer/services";
import { can } from "@bloqer/domain";
import { StockMovementList } from "@/features/inventory";
import { PageShell } from "@/components/layout/page-shell";
import { PageBackLink } from "@/components/layout/page-back-link";

export default async function MovimientosPage({
  searchParams,
}: {
  searchParams: Promise<{ contabilidad?: string }>;
}) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");
  const sp = await searchParams;
  const contabilidadErr = sp.contabilidad;

  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  const movements = await listStockMovements({}, ctx);
  const canEditAccounting = can(current.tenantCtx.roles, "EDIT", "ACCOUNTING");

  return (
    <PageShell variant="default" className="space-y-6">
      <div className="flex items-center gap-4">
        <PageBackLink href="/inventario" label="Volver" />
        <h1 className="text-2xl font-bold tracking-tight">Movimientos de stock</h1>
      </div>

      <div className="rounded-lg border bg-card">
        <div className="border-b px-6 py-4">
          <h2 className="font-semibold">Historial completo</h2>
        </div>
        <div className="p-6 space-y-4">
          {contabilidadErr && (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {contabilidadErr}
            </p>
          )}
          <StockMovementList
            movements={movements}
            accountingReturnPath="/inventario/movimientos"
            canEditAccounting={canEditAccounting}
          />
        </div>
      </div>
    </PageShell>
  );
}
