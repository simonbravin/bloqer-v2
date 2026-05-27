import { notFound, redirect } from "next/navigation";
import { PurchaseOrderEditForm } from "@/features/procurement";
import type { SupplierOption, WbsOption, ProductOption } from "@/features/procurement";
import { getCurrentUser } from "@/lib/auth";
import { PageShell } from "@/components/layout/page-shell";
import { PageBackLink } from "@/components/layout/page-back-link";
import {
  getPurchaseOrderById,
  listProcurementWbsOptions,
  listContacts,
  listProducts,
  ServiceError,
} from "@bloqer/services";

interface PageProps {
  params: Promise<{ id: string; poId: string }>;
}

export default async function EditarOrdenCompraPage({ params }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id, poId } = await params;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  let order;
  try {
    order = await getPurchaseOrderById(poId, ctx);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  if (order.status !== "DRAFT") {
    redirect(`/proyectos/${id}/ordenes-compra/${poId}`);
  }

  const [suppliersResult, wbsNodes, productsResult] = await Promise.all([
    listContacts({ role: "SUPPLIER", status: "ACTIVE", page: 1, pageSize: 200 }, ctx),
    listProcurementWbsOptions(id, ctx),
    listProducts({ status: "ACTIVE" }, ctx),
  ]);
  const products = productsResult.data;

  const suppliers: SupplierOption[] = suppliersResult.data.map((c) => ({
    id: c.id,
    label: c.fantasyName ?? c.legalName,
  }));

  const wbsOptions: WbsOption[] = wbsNodes.map((n) => ({
    id: n.id,
    code: n.code,
    name: n.name,
    budgetName: n.budgetName,
  }));

  const productOptions: ProductOption[] = products.map((p) => ({
    id: p.id,
    sku: p.sku,
    name: p.name,
    unit: p.unit,
  }));

  return (
    <PageShell variant="default" className="space-y-6">
      <div className="flex items-center gap-4">
        <PageBackLink href={`/proyectos/${id}/ordenes-compra/${poId}`} label="Volver" />
        <h1 className="text-2xl font-bold tracking-tight">Editar {order.code}</h1>
      </div>

      <PurchaseOrderEditForm
        projectId={id}
        order={order}
        suppliers={suppliers}
        wbsOptions={wbsOptions}
        productOptions={productOptions}
      />
    </PageShell>
  );
}
