import { formatDate, formatDateTime } from "@/lib/format";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SupplierInvoiceStatusBadge } from "@/features/ap";
import { EntityDocumentsPanel } from "@/features/documents";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@bloqer/domain";
import { isStorageConfigured } from "@bloqer/config";
import {
  getCompanySupplierInvoiceById,
  listEntityDocuments,
  ServiceError,
} from "@bloqer/services";
import {
  issueCompanySupplierInvoiceAction,
  cancelCompanySupplierInvoiceAction,
} from "@/app/(app)/finanzas/facturas-proveedor/actions";

interface PageProps {
  params: Promise<{ invoiceId: string }>;
}

export default async function FinanzasFacturaProveedorDetailPage({ params }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { invoiceId } = await params;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId:    current.tenantCtx.tenantId,
    companyId:   current.tenantCtx.companyId,
    roles:       current.tenantCtx.roles,
  };

  let invoice;
  try {
    invoice = await getCompanySupplierInvoiceById(invoiceId, ctx);
  } catch (err) {
    if (err instanceof ServiceError && (err.code === "NOT_FOUND" || err.code === "FORBIDDEN")) notFound();
    throw err;
  }

  const invoiceAttachments = await listEntityDocuments("SUPPLIER_INVOICE", invoiceId, ctx, {});
  const storageConfigured = isStorageConfigured();
  const canEditAttachments = can(current.tenantCtx.roles, "EDIT", "AP");

  const isDraft     = invoice.status === "DRAFT";
  const isIssued    = invoice.status === "ISSUED";
  const isCancelled = invoice.status === "CANCELLED";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/finanzas/facturas-proveedor">← Volver</Link>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">{invoice.code}</h1>
        <SupplierInvoiceStatusBadge status={invoice.status} />
      </div>

      <p className="text-sm text-muted-foreground rounded-md border border-dashed bg-muted/30 px-3 py-2">
        Factura a nivel <strong>empresa</strong> (sin proyecto). Los adjuntos y la cuenta por pagar no están ligados a
        una obra.
      </p>

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
            <p className="font-medium">{formatDate(invoice.issueDate)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Fecha de vencimiento</p>
            <p className="font-medium">{formatDate(invoice.dueDate)}</p>
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

      <div className="flex flex-wrap gap-2">
        {isDraft && (
          <>
            <form
              action={async () => {
                "use server";
                await issueCompanySupplierInvoiceAction(invoiceId);
                redirect(`/finanzas/facturas-proveedor/${invoiceId}`);
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
              await cancelCompanySupplierInvoiceAction(invoiceId);
              redirect(`/finanzas/facturas-proveedor/${invoiceId}`);
            }}
          >
            <Button type="submit" variant="destructive">Anular</Button>
          </form>
        )}
        {isIssued && (
          <Button asChild variant="outline">
            <Link href="/finanzas/cuentas-por-pagar">Ver cuentas por pagar empresa →</Link>
          </Button>
        )}
      </div>

      <EntityDocumentsPanel
        scope={{ kind: "company-finanzas-supplier-invoice" }}
        linkedEntity={{ type: "SUPPLIER_INVOICE", id: invoiceId }}
        storageConfigured={storageConfigured}
        docs={invoiceAttachments}
        canEdit={canEditAttachments}
      />
    </div>
  );
}
