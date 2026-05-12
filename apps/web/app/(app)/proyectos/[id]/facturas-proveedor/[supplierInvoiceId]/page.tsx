import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SupplierInvoiceStatusBadge } from "@/features/ap";
import { EntityDocumentsPanel } from "@/features/documents";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@bloqer/domain";
import { isStorageConfigured } from "@bloqer/config";
import {
  getSupplierInvoiceById,
  listEntityDocuments,
  ServiceError,
} from "@bloqer/services";
import {
  issueSupplierInvoiceAction,
  cancelSupplierInvoiceAction,
} from "@/app/(app)/proyectos/[id]/facturas-proveedor/actions";

interface PageProps {
  params: Promise<{ id: string; supplierInvoiceId: string }>;
}

export default async function SupplierInvoiceDetailPage({ params }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id, supplierInvoiceId } = await params;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId:    current.tenantCtx.tenantId,
    companyId:   current.tenantCtx.companyId,
    roles:       current.tenantCtx.roles,
  };

  let invoice;
  try {
    invoice = await getSupplierInvoiceById(supplierInvoiceId, ctx);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  if (invoice.projectId !== id) notFound();

  const invoiceAttachments = await listEntityDocuments(
    "SUPPLIER_INVOICE",
    supplierInvoiceId,
    ctx,
    { projectId: id },
  );
  const storageConfigured = isStorageConfigured();
  const canEditAttachments = can(current.tenantCtx.roles, "EDIT", "AP");

  const isDraft     = invoice.status === "DRAFT";
  const isIssued    = invoice.status === "ISSUED";
  const isCancelled = invoice.status === "CANCELLED";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/proyectos/${id}/facturas-proveedor`}>← Volver</Link>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">{invoice.code}</h1>
        <SupplierInvoiceStatusBadge status={invoice.status} />
      </div>

      <div className="rounded-lg border bg-card p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Proveedor</p>
            <p className="font-medium">{invoice.supplierName}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Moneda</p>
            <p className="font-medium">{invoice.currency}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Fecha de emisión</p>
            <p className="font-medium">{new Date(invoice.issueDate).toLocaleDateString("es-AR")}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Fecha de vencimiento</p>
            <p className="font-medium">{new Date(invoice.dueDate).toLocaleDateString("es-AR")}</p>
          </div>
        </div>

        <hr />

        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="pb-2 font-normal">Descripción</th>
              <th className="pb-2 font-normal text-right">Qty</th>
              <th className="pb-2 font-normal text-right">Precio</th>
              <th className="pb-2 font-normal text-right">IVA %</th>
              <th className="pb-2 font-normal text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {invoice.lines.map((line) => (
              <tr key={line.id}>
                <td className="py-1.5">{line.description}</td>
                <td className="py-1.5 text-right tabular-nums">{line.quantity}</td>
                <td className="py-1.5 text-right tabular-nums">{line.unitPrice}</td>
                <td className="py-1.5 text-right tabular-nums">{line.taxRate}</td>
                <td className="py-1.5 text-right tabular-nums">{line.lineTotal}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex justify-end gap-8 text-sm">
          <div className="text-right">
            <p className="text-muted-foreground">Subtotal</p>
            <p className="tabular-nums">{invoice.subtotal}</p>
          </div>
          <div className="text-right">
            <p className="text-muted-foreground">IVA</p>
            <p className="tabular-nums">{invoice.taxAmount}</p>
          </div>
          <div className="text-right">
            <p className="font-semibold">Total</p>
            <p className="font-semibold tabular-nums">{invoice.totalAmount} {invoice.currency}</p>
          </div>
        </div>

        {invoice.notes && (
          <div>
            <p className="text-sm text-muted-foreground">Notas</p>
            <p className="text-sm">{invoice.notes}</p>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        {isDraft && (
          <>
            <Button asChild variant="outline">
              <Link href={`/proyectos/${id}/facturas-proveedor/${supplierInvoiceId}/editar`}>
                Editar
              </Link>
            </Button>
            <form
              action={async () => {
                "use server";
                await issueSupplierInvoiceAction(supplierInvoiceId, id);
                redirect(`/proyectos/${id}/facturas-proveedor/${supplierInvoiceId}`);
              }}
            >
              <Button type="submit">Emitir factura</Button>
            </form>
          </>
        )}
        {(isDraft || isIssued) && !isCancelled && (
          <form
            action={async () => {
              "use server";
              await cancelSupplierInvoiceAction(supplierInvoiceId, id);
              redirect(`/proyectos/${id}/facturas-proveedor/${supplierInvoiceId}`);
            }}
          >
            <Button type="submit" variant="destructive">Anular</Button>
          </form>
        )}
        {isIssued && (
          <Button asChild variant="outline">
            <Link href={`/proyectos/${id}/cuentas-por-pagar`}>
              Ver cuenta por pagar →
            </Link>
          </Button>
        )}
      </div>

      <EntityDocumentsPanel
        projectId={id}
        linkedEntity={{ type: "SUPPLIER_INVOICE", id: supplierInvoiceId }}
        storageConfigured={storageConfigured}
        docs={invoiceAttachments}
        canEdit={canEditAttachments}
      />
    </div>
  );
}
