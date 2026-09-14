import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { can, fiscalDocumentKindLabel } from "@bloqer/domain";
import {
  getCompanyById,
  getCompanySupplierInvoiceById,
  getPayableBySupplierInvoiceId,
  listAllContacts,
  ServiceError,
} from "@bloqer/services";
import { SupplierInvoiceEditForm, LIST_AP_DIRECT_PAYEES, toApPayeeOption, withCurrentApPayee } from "@/features/ap";
import { PageShell } from "@/components/layout/page-shell";

interface PageProps {
  params: Promise<{ invoiceId: string }>;
}

export default async function EditarFacturaProveedorCorporativaPage({ params }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { invoiceId } = await params;
  if (!can(current.tenantCtx.roles, "EDIT", "AP")) {
    redirect(`/finanzas/facturas-proveedor/${invoiceId}`);
  }

  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  let invoice;
  let suppliersResult;
  try {
    [invoice, suppliersResult] = await Promise.all([
      getCompanySupplierInvoiceById(invoiceId, ctx),
      listAllContacts(LIST_AP_DIRECT_PAYEES, ctx),
    ]);
  } catch (err) {
    if (err instanceof ServiceError && (err.code === "NOT_FOUND" || err.code === "FORBIDDEN")) notFound();
    throw err;
  }

  if (invoice.projectId) {
    redirect(`/proyectos/${invoice.projectId}/facturas-proveedor/${invoiceId}/editar`);
  }
  if (invoice.status !== "DRAFT") {
    redirect(`/finanzas/facturas-proveedor/${invoiceId}`);
  }

  let maxCreditAmount: string | null = null;
  if (invoice.documentKind === "CREDIT_NOTE" && invoice.referencedSupplierInvoiceId) {
    try {
      const parentPayable = await getPayableBySupplierInvoiceId(
        invoice.referencedSupplierInvoiceId,
        ctx,
      );
      maxCreditAmount = parentPayable?.balanceDue ?? null;
    } catch {
      /* optional */
    }
  }

  const suppliers = withCurrentApPayee(
    suppliersResult.map(toApPayeeOption),
    { id: invoice.supplierContactId, name: invoice.supplierName },
  );

  let companyCountry: string | null = null;
  let companyIvaCondition: string | null = null;
  try {
    const company = await getCompanyById(invoice.companyId, ctx);
    companyCountry = company.country;
    companyIvaCondition = company.ivaCondition;
  } catch {
    /* optional fiscal context */
  }

  return (
    <PageShell variant="default" className="space-y-6" breadcrumbLabel={invoice.code}>
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-bold tracking-tight">
          Editar {fiscalDocumentKindLabel(invoice.documentKind).toLowerCase()} {invoice.code}
        </h1>
      </div>

      <SupplierInvoiceEditForm
        companyFinanzas
        invoice={invoice}
        suppliers={suppliers}
        companyCountry={companyCountry}
        companyIvaCondition={companyIvaCondition}
        maxCreditAmount={maxCreditAmount}
      />
    </PageShell>
  );
}
