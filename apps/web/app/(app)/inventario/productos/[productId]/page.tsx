import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getProductById, listStockMovements, ServiceError } from "@bloqer/services";
import { ProductStatusBadge, StockMovementList } from "@/features/inventory";
import { deactivateProductAction, reactivateProductAction } from "../actions";
import { PageShell } from "@/components/layout/page-shell";
import { PageBackLink } from "@/components/layout/page-back-link";
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
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  return (
    <PageShell variant="detail" className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <PageBackLink href="/inventario/productos" label="Productos" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
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
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/inventario/productos/${productId}/stock`}>Stock</Link>
          </Button>
          {product.status === "ACTIVE" ? (
            <form
              action={async () => {
                "use server";
                await deactivateProductAction(productId);
              }}
            >
              <Button variant="outline" size="sm" type="submit">
                Desactivar
              </Button>
            </form>
          ) : (
            <form
              action={async () => {
                "use server";
                await reactivateProductAction(productId);
              }}
            >
              <Button variant="outline" size="sm" type="submit">
                Reactivar
              </Button>
            </form>
          )}
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
