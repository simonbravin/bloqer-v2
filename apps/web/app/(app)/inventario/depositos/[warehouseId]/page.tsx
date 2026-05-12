import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth";
import { getWarehouseById, listStockMovements, ServiceError } from "@bloqer/services";
import { WarehouseStatusBadge, StockMovementList } from "@/features/inventory";
import { deactivateWarehouseAction, reactivateWarehouseAction } from "../actions";

const TYPE_LABELS: Record<string, string> = {
  CENTRAL: "Central", PROJECT: "Proyecto", TEMPORARY: "Temporal", OTHER: "Otro",
};

interface PageProps {
  params: Promise<{ warehouseId: string }>;
}

export default async function DepositoPage({ params }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { warehouseId } = await params;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId:    current.tenantCtx.tenantId,
    companyId:   current.tenantCtx.companyId,
    roles:       current.tenantCtx.roles,
  };

  let warehouse, movements;
  try {
    [warehouse, movements] = await Promise.all([
      getWarehouseById(warehouseId, ctx),
      listStockMovements({ warehouseId }, ctx),
    ]);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/inventario/depositos">← Depósitos</Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{warehouse.name}</h1>
            <div className="flex items-center gap-2 mt-1">
              <WarehouseStatusBadge status={warehouse.status} />
              <span className="text-sm text-muted-foreground">{TYPE_LABELS[warehouse.type] ?? warehouse.type}</span>
              {warehouse.address && <span className="text-sm text-muted-foreground">· {warehouse.address}</span>}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/inventario/depositos/${warehouseId}/stock`}>Stock</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/inventario/transferencias?warehouseId=${warehouseId}`}>Transferencias</Link>
          </Button>
          {warehouse.status === "ACTIVE" ? (
            <form action={async () => { "use server"; await deactivateWarehouseAction(warehouseId); }}>
              <Button variant="outline" size="sm" type="submit">Desactivar</Button>
            </form>
          ) : warehouse.status === "INACTIVE" ? (
            <form action={async () => { "use server"; await reactivateWarehouseAction(warehouseId); }}>
              <Button variant="outline" size="sm" type="submit">Reactivar</Button>
            </form>
          ) : null}
        </div>
      </div>

      <div className="rounded-lg border bg-card">
        <div className="border-b px-6 py-4">
          <h2 className="font-semibold">Movimientos de stock</h2>
        </div>
        <div className="p-6">
          <StockMovementList movements={movements} />
        </div>
      </div>
    </div>
  );
}
