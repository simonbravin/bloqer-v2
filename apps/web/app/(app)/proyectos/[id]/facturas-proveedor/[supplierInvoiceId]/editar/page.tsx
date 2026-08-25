import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@bloqer/domain";
import {
  getCompanyById,
  getSupplierInvoiceById,
  listContacts,
  listLinkablePurchaseOrders,
  listProcurementWbsOptions,
  ServiceError,
} from "@bloqer/services";
import { SupplierInvoiceEditForm, LIST_AP_DIRECT_PAYEES, toApPayeeOption, withCurrentApPayee } from "@/features/ap";
import { PageShell } from "@/components/layout/page-shell";

interface PageProps {
  params: Promise<{ id: string; supplierInvoiceId: string }>;
}

export default async function EditarFacturaProveedorPage({ params }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id, supplierInvoiceId } = await params;
  if (!can(current.tenantCtx.roles, "EDIT", "AP")) {
    redirect(`/proyectos/${id}/facturas-proveedor/${supplierInvoiceId}`);
  }

  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  let invoice, suppliersResult, linkablePOs, wbsNodes;
  try {
    [invoice, suppliersResult, linkablePOs, wbsNodes] = await Promise.all([
      getSupplierInvoiceById(supplierInvoiceId, ctx, id),
      listContacts(LIST_AP_DIRECT_PAYEES, ctx),
      listLinkablePurchaseOrders(id, ctx),
      listProcurementWbsOptions(id, ctx),
    ]);
  } catch (err) {
    if (err instanceof ServiceError && (err.code === "NOT_FOUND" || err.code === "FORBIDDEN")) notFound();
    throw err;
  }

  if (invoice.status !== "DRAFT") {
    redirect(`/proyectos/${id}/facturas-proveedor/${supplierInvoiceId}`);
  }

  const suppliers = withCurrentApPayee(
    suppliersResult.data.map(toApPayeeOption),
    { id: invoice.supplierContactId, name: invoice.supplierName },
  );

  const poOptions = linkablePOs.map((po) => ({
    id: po.id,
    code: po.code,
    supplierContactId: po.supplierContactId,
    currency: po.currency,
  }));

  const wbsOptions = wbsNodes.map((n) => ({
    id: n.id,
    code: n.code,
    name: n.name,
  }));

  let companyCountry: string | null = null;
  let companyIvaCondition: string | null = null;
  try {
    const company = await getCompanyById(invoice.companyId, ctx);
    companyCountry = company.country;
    companyIvaCondition = company.ivaCondition;
  } catch { /* optional */ }

  return (
    <PageShell variant="default" className="space-y-6" breadcrumbLabel={invoice.code}>
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Editar factura {invoice.code}</h1>
      </div>

      <SupplierInvoiceEditForm
        projectId={id}
        invoice={invoice}
        suppliers={suppliers}
        companyCountry={companyCountry}
        companyIvaCondition={companyIvaCondition}
        poOptions={poOptions}
        wbsOptions={wbsOptions}
      />
    </PageShell>
  );
}
