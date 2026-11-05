import Link from "next/link";
import { can } from "@bloqer/domain";
import { InventoryStatusAction } from "@/features/inventory/components/inventory-status-action";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getWarehouseById, listStockMovements, ServiceError } from "@bloqer/services";
import { WarehouseStatusBadge, StockMovementList } from "@/features/inventory";
import { deactivateWarehouseAction, reactivateWarehouseAction } from "../actions";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { DataTableSection } from "@/components/ui/data-table-section";

const TYPE_LABELS: Record<string, string> = {
  CENTRAL: "Central",
  PROJECT: "Proyecto",
  TEMPORARY: "Temporal",
  OTHER: "Otro",
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
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  let warehouse, movements;
  try {
    [warehouse, movements] = await Promise.all([
      getWarehouseById(warehouseId, ctx),
      listStockMovements({ warehouseId }, ctx),
    ]);
  } catch (err) {
    if (err instanceof ServiceError && (err.code === "NOT_FOUND" || err.code === "FORBIDDEN"))
      notFound();
    throw err;
  }

  return (
    <PageShell variant="detail" className="space-y-6" breadcrumbLabel={warehouse.name}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="break-words text-2xl font-bold tracking-tight">{warehouse.name}</h1>
            <div className="flex items-center gap-2 mt-1">
              <WarehouseStatusBadge status={warehouse.status} />
              <span className="text-sm text-muted-foreground">
                {TYPE_LABELS[warehouse.type] ?? warehouse.type}
              </span>
              {warehouse.address && (
                <span className="text-sm text-muted-foreground">· {warehouse.address}</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/inventario/depositos/${warehouseId}/stock`}>Stock</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/inventario/transferencias?warehouseId=${warehouseId}`}>
              Transferencias
            </Link>
          </Button>
          {can(ctx.roles, "EDIT", "INVENTORY") && warehouse.status !== "CLOSED" ? (
            <Button asChild variant="outline" size="sm">
              <Link href={`/inventario/depositos/${warehouseId}/editar`}>Editar</Link>
            </Button>
          ) : null}
          {can(ctx.roles, "EDIT", "INVENTORY") &&
          (warehouse.status === "ACTIVE" || warehouse.status === "INACTIVE") ? (
            <InventoryStatusAction
              label={warehouse.status === "ACTIVE" ? "Desactivar" : "Reactivar"}
              description={
                warehouse.status === "ACTIVE"
                  ? "Dejará de estar disponible para nuevas operaciones. Se conserva el historial."
                  : "Volverá a estar disponible para nuevas operaciones autorizadas."
              }
              action={
                warehouse.status === "ACTIVE"
                  ? deactivateWarehouseAction.bind(null, warehouseId)
                  : reactivateWarehouseAction.bind(null, warehouseId)
              }
            />
          ) : null}
        </div>
      </div>

      <DataTableSection title="Movimientos de stock">
        <StockMovementList movements={movements} />
      </DataTableSection>
    </PageShell>
  );
}
