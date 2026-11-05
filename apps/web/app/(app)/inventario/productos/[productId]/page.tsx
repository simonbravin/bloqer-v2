import Link from "next/link";
import { can } from "@bloqer/domain";
import { InventoryStatusAction } from "@/features/inventory/components/inventory-status-action";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getProductById, listStockMovements, ServiceError } from "@bloqer/services";
import { ProductStatusBadge, StockMovementList } from "@/features/inventory";
import { deactivateProductAction, reactivateProductAction } from "../actions";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { DataTableSection } from "@/components/ui/data-table-section";

interface PageProps {
  params: Promise<{ productId: string }>;
}

export default async function ProductoPage({ params }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { productId } = await params;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  let product, movements;
  try {
    [product, movements] = await Promise.all([
      getProductById(productId, ctx),
      listStockMovements({ productId }, ctx),
    ]);
  } catch (err) {
    if (err instanceof ServiceError && (err.code === "NOT_FOUND" || err.code === "FORBIDDEN"))
      notFound();
    throw err;
  }

  return (
    <PageShell
      variant="detail"
      className="space-y-6"
      breadcrumbLabel={`[${product.sku}] ${product.name}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="break-words text-2xl font-bold tracking-tight">
              [{product.sku}] {product.name}
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <ProductStatusBadge status={product.status} />
              {product.unit && (
                <span className="text-sm text-muted-foreground">Unidad: {product.unit}</span>
              )}
              {product.category && (
                <span className="text-sm text-muted-foreground">· {product.category}</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/inventario/productos/${productId}/stock`}>Stock</Link>
          </Button>
          {can(ctx.roles, "EDIT", "INVENTORY") ? (
            <Button asChild variant="outline" size="sm">
              <Link href={`/inventario/productos/${productId}/editar`}>Editar</Link>
            </Button>
          ) : null}
          {can(ctx.roles, "EDIT", "INVENTORY") &&
          (product.status === "ACTIVE" || product.status === "INACTIVE") ? (
            <InventoryStatusAction
              label={product.status === "ACTIVE" ? "Desactivar" : "Reactivar"}
              description={
                product.status === "ACTIVE"
                  ? "Dejará de estar disponible para nuevas operaciones. Se conserva el historial."
                  : "Volverá a estar disponible para nuevas operaciones autorizadas."
              }
              action={
                product.status === "ACTIVE"
                  ? deactivateProductAction.bind(null, productId)
                  : reactivateProductAction.bind(null, productId)
              }
            />
          ) : null}
        </div>
      </div>

      {product.description && (
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">{product.description}</p>
        </div>
      )}

      <DataTableSection title="Movimientos de stock">
        <StockMovementList movements={movements} />
      </DataTableSection>
    </PageShell>
  );
}
