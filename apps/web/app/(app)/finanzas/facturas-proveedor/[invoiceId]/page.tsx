import { formatDate } from "@/lib/format";
import { formatMoneyAmount } from "@/lib/format-money";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableScroll } from "@/components/ui/table-scroll";
import { PayableStatusBadge, SupplierInvoiceStatusBadge } from "@/features/ap";
import { EntityDocumentsPanel } from "@/features/documents";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@bloqer/domain";
import { isStorageConfigured } from "@bloqer/config";
import {
  getCompanySupplierInvoiceById,
  getPayableBySupplierInvoiceId,
  listEntityDocuments,
  ServiceError,
} from "@bloqer/services";
import { PageShell } from "@/components/layout/page-shell";
import {
  issueCompanySupplierInvoiceAction,
  cancelCompanySupplierInvoiceAction,
} from "@/app/(app)/finanzas/facturas-proveedor/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface PageProps {
  params: Promise<{ invoiceId: string }>;
}

export default async function FinanzasFacturaProveedorDetailPage({ params }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { invoiceId } = await params;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  let invoice;
  try {
    invoice = await getCompanySupplierInvoiceById(invoiceId, ctx);
  } catch (err) {
    if (err instanceof ServiceError && (err.code === "NOT_FOUND" || err.code === "FORBIDDEN"))
      notFound();
    throw err;
  }

  let payable = null;
  try {
    payable = await getPayableBySupplierInvoiceId(invoiceId, ctx);
  } catch {
    payable = null;
  }

  const invoiceAttachments = await listEntityDocuments("SUPPLIER_INVOICE", invoiceId, ctx, {});
  const storageConfigured = isStorageConfigured();
  const canEditAttachments = can(current.tenantCtx.roles, "EDIT", "AP");
  const canPay =
    Boolean(payable) &&
    can(ctx.roles, "EDIT", "AP") &&
    (payable!.status === "OPEN" ||
      payable!.status === "PARTIAL" ||
      payable!.status === "OVERDUE");

  const isDraft = invoice.status === "DRAFT";
  const isIssued = invoice.status === "ISSUED";
  const isCancelled = invoice.status === "CANCELLED";

  return (
    <PageShell variant="detail" className="space-y-6" breadcrumbLabel={invoice.code}>
      <div className="flex items-center gap-4">
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
            <p className="font-medium">{formatDate(invoice.issueDate)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Fecha de vencimiento</p>
            <p className="font-medium">{formatDate(invoice.dueDate)}</p>
          </div>
        </div>

        <hr />

        <TableScroll>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Descripción</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Precio</TableHead>
                <TableHead className="text-right">IVA %</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoice.lines.map((line) => (
                <TableRow key={line.id}>
                  <TableCell>{line.description}</TableCell>
                  <TableCell className="text-right tabular-nums">{line.quantity}</TableCell>
                  <TableCell className="text-right tabular-nums">{line.unitPrice}</TableCell>
                  <TableCell className="text-right tabular-nums">{line.taxRate}</TableCell>
                  <TableCell className="text-right tabular-nums">{line.lineTotal}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableScroll>

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
            <p className="font-semibold tabular-nums">
              {invoice.totalAmount} {invoice.currency}
            </p>
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
            <Button type="submit" variant="destructive">
              Anular
            </Button>
          </form>
        )}
      </div>

      {isIssued && payable ? (
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-base">Cuenta por pagar</CardTitle>
            <PayableStatusBadge status={payable.status} />
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm">
              Saldo pendiente:{" "}
              <span className="font-semibold tabular-nums">
                {formatMoneyAmount(payable.balanceDue, payable.currency)}
              </span>
            </p>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href={`/finanzas/cuentas-por-pagar/${payable.id}`}>Ver C×P</Link>
              </Button>
              {canPay ? (
                <Button asChild size="sm">
                  <Link href={`/finanzas/cuentas-por-pagar/${payable.id}/pagar`}>
                    Registrar pago
                  </Link>
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <EntityDocumentsPanel
        scope={{
          kind: "company-finanzas",
          afterUploadPath: `/finanzas/facturas-proveedor/${invoiceId}`,
        }}
        linkedEntity={{ type: "SUPPLIER_INVOICE", id: invoiceId }}
        storageConfigured={storageConfigured}
        docs={invoiceAttachments}
        canEdit={canEditAttachments}
      />
    </PageShell>
  );
}
