import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth";
import { getWarehouseStockDetail, ServiceError } from "@bloqer/services";
import { StockBalanceTable, StockMovementReportTable } from "@/features/inventory-reports";

interface PageProps {
  params:      Promise<{ warehouseId: string }>;
  searchParams: Promise<{ dateFrom?: string; dateTo?: string }>;
}

export default async function DepositoStockPage({ params, searchParams }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { warehouseId } = await params;
  const sp = await searchParams;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId:    current.tenantCtx.tenantId,
    companyId:   current.tenantCtx.companyId,
    roles:       current.tenantCtx.roles,
  };

  let detail;
  try {
    detail = await getWarehouseStockDetail(warehouseId, { dateFrom: sp.dateFrom, dateTo: sp.dateTo }, ctx);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  const { warehouse, balancesByProduct, movements } = detail;
  const hasNegative = balancesByProduct.some((r) => r.flags.negativeStock);
  const productCount = new Set(balancesByProduct.map((r) => r.productId)).size;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/inventario/depositos/${warehouseId}`}>← {warehouse.name}</Link>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">Stock — {warehouse.name}</h1>
      </div>

      {hasNegative && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/10 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          Este depósito tiene stock negativo en uno o más productos.
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">Productos en stock</p>
          <p className="text-2xl font-bold mt-1">{productCount}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">Movimientos totales</p>
          <p className="text-2xl font-bold mt-1">{movements.length}</p>
        </div>
      </div>

      {/* Balance by product */}
      <div className="space-y-2">
        <h2 className="font-semibold text-sm px-1">Stock por producto</h2>
        <StockBalanceTable rows={balancesByProduct} />
      </div>

      {/* Movement history */}
      <div className="space-y-2">
        <h2 className="font-semibold text-sm px-1">Historial de movimientos</h2>
        <StockMovementReportTable rows={movements} showProduct showWarehouse={false} />
      </div>
    </div>
  );
}
