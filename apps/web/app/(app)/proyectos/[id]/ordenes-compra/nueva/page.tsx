import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PurchaseOrderForm } from "@/features/procurement";
import type { SupplierOption, WbsOption, ProductOption } from "@/features/procurement";
import { getCurrentUser } from "@/lib/auth";
import { listContacts, listProcurementWbsOptions, listProducts } from "@bloqer/services";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function NuevaOrdenCompraPage({ params }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id } = await params;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId:    current.tenantCtx.tenantId,
    companyId:   current.tenantCtx.companyId,
    roles:       current.tenantCtx.roles,
  };

  const [suppliersResult, wbsNodes, products] = await Promise.all([
    listContacts({ role: "SUPPLIER", status: "ACTIVE", page: 1, pageSize: 200 }, ctx),
    listProcurementWbsOptions(id, ctx),
    listProducts({ status: "ACTIVE" }, ctx),
  ]);

  const suppliers: SupplierOption[] = suppliersResult.data.map((c) => ({
    id:    c.id,
    label: c.fantasyName ?? c.legalName,
  }));

  const wbsOptions: WbsOption[] = wbsNodes.map((n) => ({
    id:         n.id,
    code:       n.code,
    name:       n.name,
    budgetName: n.budgetName,
  }));

  const productOptions: ProductOption[] = products.map((p) => ({
    id:   p.id,
    sku:  p.sku,
    name: p.name,
    unit: p.unit,
  }));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/proyectos/${id}/ordenes-compra`}>← Volver</Link>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">Nueva orden de compra</h1>
      </div>

      <PurchaseOrderForm projectId={id} suppliers={suppliers} wbsOptions={wbsOptions} productOptions={productOptions} />
    </div>
  );
}
