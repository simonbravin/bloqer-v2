import { notFound, redirect } from "next/navigation";
import { ReceiptForm } from "@/features/procurement";
import { getCurrentUser } from "@/lib/auth";
import { getPurchaseOrderById, listWarehouses, ServiceError } from "@bloqer/services";
import { PageShell } from "@/components/layout/page-shell";
import { PageBackLink } from "@/components/layout/page-back-link";

interface PageProps {
  params: Promise<{ id: string; poId: string }>;
}

export default async function NuevaRecepcionPage({ params }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id, poId } = await params;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  let order, warehouses;
  try {
    [order, warehouses] = await Promise.all([
      getPurchaseOrderById(poId, ctx),
      listWarehouses({ status: "ACTIVE" }, ctx),
    ]);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  if (!["CONFIRMED", "PARTIALLY_RECEIVED"].includes(order.status)) {
    redirect(`/proyectos/${id}/ordenes-compra/${poId}`);
  }

  const warehouseOptions = warehouses.map((w) => ({ id: w.id, name: w.name }));

  return (
    <PageShell variant="default" className="space-y-6">
      <div className="flex items-center gap-4">
        <PageBackLink href={`/proyectos/${id}/ordenes-compra/${poId}`} label="Volver" />
        <h1 className="text-2xl font-bold tracking-tight">Registrar recepción</h1>
      </div>

      <ReceiptForm
        projectId={id}
        purchaseOrderId={poId}
        purchaseOrderCode={order.code}
        poLines={order.lines}
        warehouseOptions={warehouseOptions}
      />
    </PageShell>
  );
}
