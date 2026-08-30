import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getProductStockDetail, ServiceError } from "@bloqer/services";
import { StockBalanceTable, StockMovementReportTable } from "@/features/inventory-reports";
import { PageShell } from "@/components/layout/page-shell";
import { KpiStatCard } from "@/components/ui/kpi-stat-card";
import { KpiStatGrid } from "@/components/ui/kpi-stat-grid";
import { formatQtyFromString } from "@/lib/format-money";
import { addDecimal } from "@bloqer/utils";

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
    if (err instanceof ServiceError && (err.code === "NOT_FOUND" || err.code === "FORBIDDEN")) notFound();
    throw err;
  }

  const { product, balancesByWarehouse, movements } = detail;
  const totalOnHand = balancesByWarehouse.reduce((s, r) => addDecimal(s, r.quantityOnHand), "0");
  const hasNegative = balancesByWarehouse.some((r) => r.flags.negativeStock);

  return (
    <PageShell variant="default" className="space-y-6">
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Stock — {product.name}</h1>
      </div>

      <KpiStatGrid title={null} columns={3}>
        <KpiStatCard
          label="Total en stock"
          value={formatQtyFromString(totalOnHand)}
          subtitle={product.unit}
          tone={hasNegative ? "danger" : "default"}
        />
        <KpiStatCard
          label="Depósitos con stock"
          value={String(balancesByWarehouse.filter((r) => !r.flags.zeroStock).length)}
        />
        <KpiStatCard label="Movimientos totales" value={String(movements.length)} />
      </KpiStatGrid>

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
