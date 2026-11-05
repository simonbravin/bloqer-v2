import { redirect } from "next/navigation";
import { can } from "@bloqer/domain";
import { getCurrentUser } from "@/lib/auth";
import { listWarehouses, listProducts, getSourceStockPreview } from "@bloqer/services";
import { WarehouseTransferForm } from "@/features/warehouse-transfer";
import { createWarehouseTransferAction } from "../actions";
import { PageShell } from "@/components/layout/page-shell";

interface PageProps {
  searchParams: Promise<{ sourceWarehouseId?: string; productId?: string }>;
}

export default async function NuevaTransferenciaPage({ searchParams }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");
  if (!can(current.tenantCtx.roles, "EDIT", "INVENTORY")) redirect("/inventario/transferencias");

  const sp = await searchParams;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  const [warehouses, productsResult] = await Promise.all([
    listWarehouses({ status: "ACTIVE" }, ctx),
    listProducts({ status: "ACTIVE" }, ctx),
  ]);
  const products = productsResult.data;
  const selectedSourceId = warehouses.some((w) => w.id === sp.sourceWarehouseId)
    ? sp.sourceWarehouseId
    : undefined;
  const selectedProductId = products.some((p) => p.id === sp.productId) ? sp.productId : undefined;

  let sourceStockBalance: string | undefined;
  if (selectedSourceId && selectedProductId) {
    try {
      sourceStockBalance = await getSourceStockPreview(selectedSourceId, selectedProductId, ctx);
    } catch {
      // preview is non-blocking — service validation is the real guard
    }
  }

  return (
    <PageShell variant="default" className="space-y-6">
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Nueva transferencia de depósito</h1>
      </div>

      <div className="rounded-lg border bg-card p-6">
        <WarehouseTransferForm
          warehouses={warehouses.map((w) => ({ id: w.id, name: w.name }))}
          products={products.map((p) => ({ id: p.id, name: p.name, unit: p.unit }))}
          sourceStockBalance={sourceStockBalance}
          selectedSourceId={selectedSourceId}
          selectedProductId={selectedProductId}
          action={createWarehouseTransferAction}
        />
      </div>
    </PageShell>
  );
}
