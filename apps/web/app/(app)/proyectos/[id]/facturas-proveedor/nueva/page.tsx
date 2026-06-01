import { notFound, redirect } from "next/navigation";
import { SupplierInvoiceForm } from "@/features/ap";
import type { SupplierOption, POOption } from "@/features/ap";
import { getCurrentUser } from "@/lib/auth";
import {
  createSupplierInvoiceDraftFromPurchaseOrder,
  listContacts,
  listLinkablePurchaseOrders,
  ServiceError,
} from "@bloqer/services";
import { createSupplierInvoiceFromPurchaseOrderSchema } from "@bloqer/validators";
import { PageShell } from "@/components/layout/page-shell";
import { PageBackLink } from "@/components/layout/page-back-link";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    purchaseOrderId?: string;
    purchaseReceiptId?: string;
    basis?: string;
    error?: string;
  }>;
}

export default async function NuevaFacturaProveedorPage({ params, searchParams }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id } = await params;
  const sp = await searchParams;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  if (sp.purchaseOrderId) {
    const parsed = createSupplierInvoiceFromPurchaseOrderSchema.safeParse({
      projectId: id,
      purchaseOrderId: sp.purchaseOrderId,
      purchaseReceiptId: sp.purchaseReceiptId ?? null,
      basis: sp.basis === "remaining" ? "remaining" : "received",
    });
    if (parsed.success) {
      try {
        const inv = await createSupplierInvoiceDraftFromPurchaseOrder(parsed.data, ctx);
        redirect(`/proyectos/${id}/facturas-proveedor/${inv.id}`);
      } catch (err) {
        if (err instanceof ServiceError) {
          const errQuery = new URLSearchParams({
            error: err.message,
            purchaseOrderId: sp.purchaseOrderId,
          });
          if (sp.purchaseReceiptId) errQuery.set("purchaseReceiptId", sp.purchaseReceiptId);
          redirect(`/proyectos/${id}/facturas-proveedor/nueva?${errQuery.toString()}`);
        }
        throw err;
      }
    }
  }

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
    <PageShell variant="default" className="space-y-6">
      <div className="flex items-center gap-4">
        <PageBackLink href={`/proyectos/${id}/facturas-proveedor`} label="Volver" />
        <h1 className="text-2xl font-bold tracking-tight">Nueva factura de proveedor</h1>
      </div>

      {sp.error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {sp.error}
        </div>
      )}

      <SupplierInvoiceForm projectId={id} suppliers={suppliers} poOptions={poOptions} />
    </PageShell>
  );
}
