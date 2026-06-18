import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getProductStockDetail, ServiceError } from "@bloqer/services";
import { StockBalanceTable, StockMovementReportTable } from "@/features/inventory-reports";
import { PageShell } from "@/components/layout/page-shell";

interface PageProps {
  params: Promise<{ productId: string }>;
  searchParams: Promise<{ dateFrom?: string; dateTo?: string }>;
}

export default async function ProductoStockPage({ params, searchParams }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { productId } = await params;
  const sp = await searchParams;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  let detail;
  try {
    detail = await getProductStockDetail(
      productId,
      { dateFrom: sp.dateFrom, dateTo: sp.dateTo },
      ctx,
    );
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  const { product, balancesByWarehouse, movements } = detail;
  const totalOnHand = balancesByWarehouse.reduce((s, r) => s + parseFloat(r.quantityOnHand), 0);
  const hasNegative = balancesByWarehouse.some((r) => r.flags.negativeStock);

  return (
    <PageShell variant="default" className="space-y-6">
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Stock — {product.name}</h1>
      </div>

      {/* Summary card */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">Total en stock</p>
          <p
            className={`text-2xl font-bold font-mono mt-1 tabular-nums ${hasNegative ? "text-red-600 dark:text-red-400" : ""}`}
          >
            {totalOnHand.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">{product.unit}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">Depósitos con stock</p>
          <p className="text-2xl font-bold mt-1">
            {balancesByWarehouse.filter((r) => !r.flags.zeroStock).length}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">Movimientos totales</p>
          <p className="text-2xl font-bold mt-1">{movements.length}</p>
        </div>
      </div>

      {/* Balance by warehouse */}
      <div className="space-y-2">
        <h2 className="font-semibold text-sm px-1">Stock por depósito</h2>
        <StockBalanceTable rows={balancesByWarehouse} />
      </div>

      {/* Movement Kardex */}
      <div className="space-y-2">
        <h2 className="font-semibold text-sm px-1">Kardex de movimientos</h2>
        <StockMovementReportTable rows={movements} showProduct={false} showWarehouse />
      </div>
    </PageShell>
  );
}
