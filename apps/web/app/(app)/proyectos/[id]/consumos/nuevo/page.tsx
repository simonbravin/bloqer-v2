import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listInventoryConsumptionWbsOptions, listProducts, listWarehouses } from "@bloqer/services";
import { ConsumptionForm } from "@/features/inventory";
import type { ProductOption, WarehouseOption, WbsOption } from "@/features/inventory";
import { PageShell } from "@/components/layout/page-shell";
import { can } from "@bloqer/domain";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function NuevoConsumoPage({ params }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id } = await params;
  if (!can(current.tenantCtx.roles, "EDIT", "INVENTORY")) {
    redirect(`/proyectos/${id}/consumos`);
  }
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  const [productsResult, warehouses, wbsNodes] = await Promise.all([
    listProducts({ status: "ACTIVE" }, ctx),
    listWarehouses({ status: "ACTIVE" }, ctx),
    listInventoryConsumptionWbsOptions(id, ctx),
  ]);
  const products = productsResult.data;

  const productOptions: ProductOption[] = products.map((p) => ({
    id: p.id,
    name: p.name,
    sku: p.sku,
    unit: p.unit,
  }));

  const warehouseOptions: WarehouseOption[] = warehouses.map((w) => ({
    id: w.id,
    name: w.name,
  }));

  const wbsOptions: WbsOption[] = wbsNodes.map((w) => ({
    id: w.id,
    code: w.code,
    name: w.name,
  }));

  return (
    <PageShell variant="default" className="space-y-6">
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Registrar consumo</h1>
      </div>

      <div className="rounded-lg border bg-card p-6">
        <ConsumptionForm
          projectId={id}
          products={productOptions}
          warehouses={warehouseOptions}
          wbsOptions={wbsOptions}
        />
      </div>
    </PageShell>
  );
}
