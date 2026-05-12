import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PurchaseOrderList } from "@/features/procurement";
import type { PurchaseOrderListItem } from "@/features/procurement";
import { getCurrentUser } from "@/lib/auth";
import { listPurchaseOrdersByProject, ServiceError } from "@bloqer/services";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function OrdenesCompraPage({ params }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id } = await params;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId:    current.tenantCtx.tenantId,
    companyId:   current.tenantCtx.companyId,
    roles:       current.tenantCtx.roles,
  };

  let orders;
  try {
    orders = await listPurchaseOrdersByProject(id, ctx);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  const items: PurchaseOrderListItem[] = orders.map((o) => ({
    id:                   o.id,
    code:                 o.code,
    supplierName:         o.supplierName,
    issueDate:            o.issueDate,
    expectedDeliveryDate: o.expectedDeliveryDate,
    totalAmount:          o.totalAmount,
    currency:             o.currency,
    status:               o.status,
  }));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/proyectos/${id}`}>← Volver</Link>
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">Órdenes de compra</h1>
        </div>
        <Button asChild>
          <Link href={`/proyectos/${id}/ordenes-compra/nueva`}>Nueva OC</Link>
        </Button>
      </div>

      <div className="rounded-lg border bg-card">
        <div className="border-b px-6 py-4">
          <h2 className="font-semibold">Órdenes del proyecto</h2>
        </div>
        <div className="p-6">
          <PurchaseOrderList orders={items} projectId={id} />
        </div>
      </div>
    </div>
  );
}
