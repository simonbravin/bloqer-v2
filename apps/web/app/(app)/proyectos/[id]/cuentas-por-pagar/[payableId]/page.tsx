import { formatDate, formatDateTime } from "@/lib/format";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DataTableSection } from "@/components/ui/data-table-section";
import { PayableStatusBadge, PaymentTable } from "@/features/ap";
import type { PaymentListItem } from "@/features/ap";
import { getCurrentUser } from "@/lib/auth";
import { PageShell } from "@/components/layout/page-shell";
import {
  getPayableById,
  getPurchaseOrderCodeForApLink,
  getSupplierInvoiceById,
  listPaymentsByPayable,
  ServiceError,
} from "@bloqer/services";
import { Button } from "@/components/ui/button";

interface PageProps {
  params: Promise<{ id: string; payableId: string }>;
}

export default async function PayableDetailPage({ params }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id, payableId } = await params;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  let payable;
  let payments;
  let invoice;
  let poCode: string | null = null;
  try {
    [payable, payments] = await Promise.all([
      getPayableById(payableId, ctx, id),
      listPaymentsByPayable(payableId, ctx),
    ]);
    invoice = await getSupplierInvoiceById(payable.supplierInvoiceId, ctx, id);
    if (invoice.purchaseOrderId) {
      poCode = await getPurchaseOrderCodeForApLink(invoice.purchaseOrderId, ctx);
    }
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  const paymentItems: PaymentListItem[] = payments.map((p) => ({
    id: p.id,
    paymentDate: p.paymentDate,
    amount: p.amount,
    currency: p.currency,
    status: p.status,
    accountName: p.accountName,
    supplierInvoiceId: p.supplierInvoiceId,
  }));

  const canPay =
    Number(payable.balanceDue) > 0
    && (payable.status === "OPEN" || payable.status === "PARTIAL" || payable.status === "OVERDUE");

  return (
    <PageShell variant="default" className="space-y-6" breadcrumbLabel={payable.supplierName}>
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Cuenta por pagar</h1>
        <PayableStatusBadge status={payable.status} />
      </div>

      <p className="text-xs text-muted-foreground">
        {invoice.purchaseOrderId ? (
          <>
            <Link
              href={`/proyectos/${id}/ordenes-compra/${invoice.purchaseOrderId}`}
              className="text-primary hover:underline"
            >
              {poCode ?? "Orden de compra"}
            </Link>
            {" → "}
          </>
        ) : null}
        <Link
          href={`/proyectos/${id}/facturas-proveedor/${payable.supplierInvoiceId}`}
          className="text-primary hover:underline"
        >
          Factura proveedor
        </Link>
        {" → Cuenta por pagar"}
      </p>

      <div className="rounded-lg border bg-card p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Proveedor</p>
            <p className="font-medium">{payable.supplierName}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Moneda</p>
            <p className="font-medium">{payable.currency}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Emisión</p>
            <p className="font-medium">{formatDate(payable.issueDate)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Vencimiento</p>
            <p className="font-medium">{formatDate(payable.dueDate)}</p>
          </div>
        </div>

        <hr />

        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Total original</p>
            <p className="font-medium tabular-nums">
              {Number(payable.originalAmount).toLocaleString("es-AR", {
                style: "currency",
                currency: payable.currency,
              })}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Pagado</p>
            <p className="font-medium tabular-nums">
              {Number(payable.paidAmount).toLocaleString("es-AR", {
                style: "currency",
                currency: payable.currency,
              })}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground font-semibold">Saldo pendiente</p>
            <p className="font-semibold tabular-nums">
              {Number(payable.balanceDue).toLocaleString("es-AR", {
                style: "currency",
                currency: payable.currency,
              })}
            </p>
          </div>
        </div>

        <Button asChild>
          <Link href={`/proyectos/${id}/facturas-proveedor/${payable.supplierInvoiceId}`}>
            Ver factura →
          </Link>
        </Button>
      </div>

      {canPay && (
        <div className="flex justify-end">
          <Button asChild>
            <Link href={`/proyectos/${id}/cuentas-por-pagar/${payableId}/pagar`}>
              Registrar pago
            </Link>
          </Button>
        </div>
      )}

      <DataTableSection title="Pagos registrados">
        <PaymentTable payments={paymentItems} hrefPrefix={`/proyectos/${id}/pagos`} />
      </DataTableSection>
    </PageShell>
  );
}
