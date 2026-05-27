import { notFound, redirect } from "next/navigation";
import { SupplierInvoiceForm } from "@/features/ap";
import type { SupplierOption, POOption } from "@/features/ap";
import { getCurrentUser } from "@/lib/auth";
import { listContacts, listLinkablePurchaseOrders, ServiceError } from "@bloqer/services";
import { PageShell } from "@/components/layout/page-shell";
import { PageBackLink } from "@/components/layout/page-back-link";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function NuevaFacturaProveedorPage({ params }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id } = await params;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  let suppliersResult, linkablePOs;
  try {
    [suppliersResult, linkablePOs] = await Promise.all([
      listContacts({ role: "SUPPLIER", status: "ACTIVE", page: 1, pageSize: 200 }, ctx),
      listLinkablePurchaseOrders(id, ctx),
    ]);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  const suppliers: SupplierOption[] = suppliersResult.data.map((c) => ({
    id: c.id,
    label: c.fantasyName ?? c.legalName,
  }));

  const poOptions: POOption[] = linkablePOs.map((po) => ({
    id: po.id,
    code: po.code,
    supplierContactId: po.supplierContactId,
    currency: po.currency,
  }));

  return (
    <PageShell variant="form" className="space-y-6">
      <div className="flex items-center gap-4">
        <PageBackLink href={`/proyectos/${id}/facturas-proveedor`} label="Volver" />
        <h1 className="text-2xl font-bold tracking-tight">Nueva factura de proveedor</h1>
      </div>

      <SupplierInvoiceForm projectId={id} suppliers={suppliers} poOptions={poOptions} />
    </PageShell>
  );
}
