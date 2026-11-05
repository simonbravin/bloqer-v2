import { notFound, redirect } from "next/navigation";
import { can } from "@bloqer/domain";
import { getWarehouseById, ServiceError } from "@bloqer/services";
import { getCurrentUser } from "@/lib/auth";
import { PageShell } from "@/components/layout/page-shell";
import { WarehouseForm } from "@/features/inventory";

export default async function EditPage({ params }: { params: Promise<{ warehouseId: string }> }) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");
  const { warehouseId } = await params;
  const ctx = { actorUserId: current.session.user.id!, ...current.tenantCtx };
  if (!can(ctx.roles, "EDIT", "INVENTORY")) redirect(`/inventario/depositos/${warehouseId}`);
  let warehouse;
  try {
    warehouse = await getWarehouseById(warehouseId, ctx);
  } catch (error) {
    if (error instanceof ServiceError && (error.code === "FORBIDDEN" || error.code === "NOT_FOUND"))
      notFound();
    throw error;
  }
  if (warehouse.status === "CLOSED") redirect(`/inventario/depositos/${warehouseId}`);
  return (
    <PageShell variant="detail" className="space-y-6" breadcrumbLabel="Editar">
      <h1 className="text-2xl font-bold tracking-tight">Editar depósito</h1>
      <div className="rounded-lg border bg-card p-6">
        <WarehouseForm
          companyId={warehouse.companyId}
          projectId={warehouse.projectId ?? undefined}
          warehouseId={warehouseId}
          initialValues={{
            name: warehouse.name,
            type: warehouse.type,
            address: warehouse.address,
            notes: warehouse.notes,
          }}
        />
      </div>
    </PageShell>
  );
}
