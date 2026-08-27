import { notFound, redirect } from "next/navigation";
import { ReceiptCreateComposer } from "@/features/procurement/components/receipt-create-composer";
import { getCurrentUser } from "@/lib/auth";
import {
  canEditPurchaseReceipts,
  getPurchaseOrderById,
  listWarehouses,
  ServiceError,
} from "@bloqer/services";
import { PageShell } from "@/components/layout/page-shell";

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

  const poHref = `/proyectos/${id}/ordenes-compra/${poId}`;

  // Deep-links from Pendientes/campana ([D-094]) land here; only receivers may use the form.
  if (!canEditPurchaseReceipts(ctx.roles)) {
    redirect(poHref);
  }

  let order;
  try {
    order = await getPurchaseOrderById(poId, ctx);
  } catch (err) {
    if (err instanceof ServiceError && (err.code === "NOT_FOUND" || err.code === "FORBIDDEN")) {
      notFound();
    }
    throw err;
  }

  if (order.projectId !== id) notFound();

  if (!["CONFIRMED", "PARTIALLY_RECEIVED"].includes(order.status)) {
    redirect(poHref);
  }

  // Warehouse list needs INVENTORY module + VIEW; receipt itself does not (warehouse optional).
  // Never 404 the receive form when deposits are unavailable.
  let warehouseOptions: Array<{ id: string; name: string }> = [];
  try {
    const warehouses = await listWarehouses({ status: "ACTIVE" }, ctx);
    warehouseOptions = warehouses.map((w) => ({ id: w.id, name: w.name }));
  } catch (err) {
    if (!(err instanceof ServiceError && (err.code === "FORBIDDEN" || err.code === "NOT_FOUND"))) {
      throw err;
    }
  }

  return (
    <PageShell
      variant="default"
      className="space-y-6"
      breadcrumbSegmentLabels={{ [poId]: order.code }}
    >
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Registrar recepción</h1>
      </div>

      <ReceiptCreateComposer
        projectId={id}
        purchaseOrderId={poId}
        purchaseOrderCode={order.code}
        poLines={order.lines}
        warehouseOptions={warehouseOptions}
      />
    </PageShell>
  );
}
