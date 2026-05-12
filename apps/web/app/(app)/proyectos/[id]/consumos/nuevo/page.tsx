import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth";
import { listProducts, listWarehouses, listProcurementWbsOptions } from "@bloqer/services";
import { ConsumptionForm } from "@/features/inventory";
import type { ProductOption, WarehouseOption, WbsOption } from "@/features/inventory";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function NuevoConsumoPage({ params }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id } = await params;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId:    current.tenantCtx.tenantId,
    companyId:   current.tenantCtx.companyId,
    roles:       current.tenantCtx.roles,
  };

  const [products, warehouses, wbsNodes] = await Promise.all([
    listProducts({ status: "ACTIVE" }, ctx),
    listWarehouses({ status: "ACTIVE" }, ctx),
    listProcurementWbsOptions(id, ctx),
  ]);

  const productOptions: ProductOption[] = products.map((p) => ({
    id: p.id, name: p.name, sku: p.sku, unit: p.unit,
  }));

  const warehouseOptions: WarehouseOption[] = warehouses.map((w) => ({
    id: w.id, name: w.name,
  }));

  const wbsOptions: WbsOption[] = wbsNodes.map((w) => ({
    id: w.id, code: w.code, name: w.name,
  }));

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/proyectos/${id}/inventario`}>← Inventario del proyecto</Link>
        </Button>
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
    </div>
  );
}
