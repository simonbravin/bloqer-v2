import { formatDate } from "@/lib/format";
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
import { formatMoneyAmount } from "@/lib/format-money";
import {
  getPayableBySupplierInvoiceId,
  getPurchaseOrderCodeForApLink,
  getSupplierInvoiceById,
  getSupplierInvoicePurchaseOrderWarnings,
  listEntityDocuments,
  ServiceError,
} from "@bloqer/services";
import { PageShell } from "@/components/layout/page-shell";
import {
  issueSupplierInvoiceAction,
  cancelSupplierInvoiceAction,
} from "@/app/(app)/proyectos/[id]/facturas-proveedor/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface PageProps {
  params: Promise<{ id: string; supplierInvoiceId: string }>;
}

export default async function SupplierInvoiceDetailPage({ params }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id, supplierInvoiceId } = await params;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  let invoice;
  let payable;
  let warnings: string[] = [];
  let poCode: string | null = null;

  try {
    invoice = await getSupplierInvoiceById(supplierInvoiceId, ctx, id);
    if (invoice.status === "ISSUED") {
      payable = await getPayableBySupplierInvoiceId(supplierInvoiceId, ctx, id);
    }
    if (invoice.purchaseOrderId) {
      warnings = await getSupplierInvoicePurchaseOrderWarnings(supplierInvoiceId, ctx);
      poCode = await getPurchaseOrderCodeForApLink(invoice.purchaseOrderId, ctx);
    }
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  if (invoice.projectId !== id) notFound();

  const invoiceAttachments = await listEntityDocuments("SUPPLIER_INVOICE", supplierInvoiceId, ctx, {
    projectId: id,
  });
  const storageConfigured = isStorageConfigured();
  const canEditAttachments = can(current.tenantCtx.roles, "EDIT", "AP");

  const isDraft = invoice.status === "DRAFT";
  const isIssued = invoice.status === "ISSUED";
  const isCancelled = invoice.status === "CANCELLED";
  const canPay =
    payable
    && (payable.status === "OPEN" ||
      payable.status === "PARTIAL" ||
      payable.status === "OVERDUE");

  return (
    <PageShell variant="default" className="space-y-6" breadcrumbLabel={invoice.code}>
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-bold tracking-tight">{invoice.code}</h1>
        <SupplierInvoiceStatusBadge status={invoice.status} />
      </div>

      {(invoice.purchaseOrderId || invoice.subcontractCertificationId || (isIssued && payable)) ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Relacionados</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {invoice.purchaseOrderId && poCode ? (
              <Button asChild variant="outline" size="sm">
                <Link href={`/proyectos/${id}/ordenes-compra/${invoice.purchaseOrderId}`}>
                  Ver OC {poCode}
                </Link>
              </Button>
            ) : null}
            {invoice.subcontractCertificationId && invoice.subcontractId ? (
              <Button asChild variant="outline" size="sm">
                <Link
                  href={`/proyectos/${id}/subcontratos/${invoice.subcontractId}/certificaciones/${invoice.subcontractCertificationId}`}
                >
                  Ver {invoice.subcontractCertificationCode ?? "certificación SC"}
                </Link>
              </Button>
            ) : null}
            {isIssued && payable ? (
              <Button asChild variant="outline" size="sm">
                <Link href={`/proyectos/${id}/cuentas-por-pagar/${payable.id}`}>Ver C×P</Link>
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {warnings.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 px-4 py-3 text-sm text-amber-900 dark:text-amber-200 space-y-1">
          <p className="font-medium">Advertencias de conciliación con la OC</p>
          <ul className="list-disc list-inside text-xs space-y-1">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}

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
                <Link href={`/proyectos/${id}/cuentas-por-pagar/${payable.id}`}>
                  Ver C×P
                </Link>
              </Button>
              {canPay ? (
                <Button asChild size="sm">
                  <Link href={`/proyectos/${id}/cuentas-por-pagar/${payable.id}/pagar`}>
                    Registrar pago
                  </Link>
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="flex gap-2 flex-wrap">
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
            <Button type="submit" variant="destructive">
              Anular
            </Button>
          </form>
        )}
      </div>

      <EntityDocumentsPanel
        scope={{ kind: "project", projectId: id }}
        linkedEntity={{ type: "SUPPLIER_INVOICE", id: supplierInvoiceId }}
        storageConfigured={storageConfigured}
        docs={invoiceAttachments}
        canEdit={canEditAttachments}
      />
    </PageShell>
  );
}
