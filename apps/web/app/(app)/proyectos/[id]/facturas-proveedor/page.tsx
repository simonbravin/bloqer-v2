import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SupplierInvoiceList } from "@/features/ap";
import type { SupplierInvoiceListItem } from "@/features/ap";
import { getCurrentUser } from "@/lib/auth";
import { listSupplierInvoicesByProject, ServiceError } from "@bloqer/services";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function FacturasProveedorPage({ params }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id } = await params;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId:    current.tenantCtx.tenantId,
    companyId:   current.tenantCtx.companyId,
    roles:       current.tenantCtx.roles,
  };

  let invoices;
  try {
    invoices = await listSupplierInvoicesByProject(id, ctx);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  const items: SupplierInvoiceListItem[] = invoices.map((inv) => ({
    id:           inv.id,
    code:         inv.code,
    supplierName: inv.supplierName,
    issueDate:    inv.issueDate,
    dueDate:      inv.dueDate,
    totalAmount:  inv.totalAmount,
    currency:     inv.currency,
    status:       inv.status,
  }));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/proyectos/${id}`}>← Volver</Link>
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">Facturas de proveedor</h1>
        </div>
        <Button asChild>
          <Link href={`/proyectos/${id}/facturas-proveedor/nueva`}>Nueva factura</Link>
        </Button>
      </div>

      <div className="rounded-lg border bg-card">
        <div className="border-b px-6 py-4">
          <h2 className="font-semibold">Facturas del proyecto</h2>
        </div>
        <div className="p-6">
          <SupplierInvoiceList invoices={items} hrefPrefix={`/proyectos/${id}/facturas-proveedor`} />
        </div>
      </div>
    </div>
  );
}
