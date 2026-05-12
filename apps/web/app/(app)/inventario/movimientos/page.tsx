import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth";
import { listStockMovements } from "@bloqer/services";
import { can } from "@bloqer/domain";
import { StockMovementList } from "@/features/inventory";

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
    tenantId:    current.tenantCtx.tenantId,
    companyId:   current.tenantCtx.companyId,
    roles:       current.tenantCtx.roles,
  };

  const movements = await listStockMovements({}, ctx);
  const canEditAccounting = can(current.tenantCtx.roles, "EDIT", "ACCOUNTING");

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/inventario">← Volver</Link>
        </Button>
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
    </div>
  );
}
