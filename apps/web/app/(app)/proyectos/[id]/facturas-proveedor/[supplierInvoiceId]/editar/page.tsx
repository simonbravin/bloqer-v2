import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth";
import {
  getSupplierInvoiceById,
  listContacts,
  listLinkablePurchaseOrders,
  ServiceError,
} from "@bloqer/services";
import { SupplierInvoiceEditForm } from "@/features/ap";

interface PageProps {
  params: Promise<{ id: string; supplierInvoiceId: string }>;
}

export default async function EditarFacturaProveedorPage({ params }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id, supplierInvoiceId } = await params;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId:    current.tenantCtx.tenantId,
    companyId:   current.tenantCtx.companyId,
    roles:       current.tenantCtx.roles,
  };

  let invoice, suppliersResult, linkablePOs;
  try {
    [invoice, suppliersResult, linkablePOs] = await Promise.all([
      getSupplierInvoiceById(supplierInvoiceId, ctx),
      listContacts({ role: "SUPPLIER", status: "ACTIVE", page: 1, pageSize: 200 }, ctx),
      listLinkablePurchaseOrders(id, ctx),
    ]);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  if (invoice.status !== "DRAFT") {
    redirect(`/proyectos/${id}/facturas-proveedor/${supplierInvoiceId}`);
  }

  const suppliers = suppliersResult.data.map((c) => ({
    id:    c.id,
    label: c.fantasyName ?? c.legalName,
  }));

  const poOptions = linkablePOs.map((po) => ({
    id:                po.id,
    code:              po.code,
    supplierContactId: po.supplierContactId,
    currency:          po.currency,
  }));

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/proyectos/${id}/facturas-proveedor/${supplierInvoiceId}`}>← Volver</Link>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">Editar factura {invoice.code}</h1>
      </div>

      <SupplierInvoiceEditForm
        projectId={id}
        invoice={invoice}
        suppliers={suppliers}
        poOptions={poOptions}
      />
    </div>
  );
}
