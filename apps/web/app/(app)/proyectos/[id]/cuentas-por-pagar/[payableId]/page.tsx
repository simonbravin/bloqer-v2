import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PayableStatusBadge, PaymentList } from "@/features/ap";
import type { PaymentListItem } from "@/features/ap";
import { getCurrentUser } from "@/lib/auth";
import {
  getPayableById,
  listPaymentsByPayable,
  ServiceError,
} from "@bloqer/services";

interface PageProps {
  params: Promise<{ id: string; payableId: string }>;
}

export default async function PayableDetailPage({ params }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id, payableId } = await params;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId:    current.tenantCtx.tenantId,
    companyId:   current.tenantCtx.companyId,
    roles:       current.tenantCtx.roles,
  };

  let payable;
  let payments;
  try {
    [payable, payments] = await Promise.all([
      getPayableById(payableId, ctx, id),
      listPaymentsByPayable(payableId, ctx),
    ]);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  const paymentItems: PaymentListItem[] = payments.map((p) => ({
    id:                p.id,
    projectId:         id,
    paymentDate:       p.paymentDate,
    amount:            p.amount,
    currency:          p.currency,
    status:            p.status,
    accountName:       p.accountName,
    supplierInvoiceId: p.supplierInvoiceId,
  }));

  const canPay = payable.status === "OPEN" || payable.status === "PARTIAL" || payable.status === "OVERDUE";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/proyectos/${id}/cuentas-por-pagar`}>← Volver</Link>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">Cuenta por pagar</h1>
        <PayableStatusBadge status={payable.status} />
      </div>

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
            <p className="font-medium">{new Date(payable.issueDate).toLocaleDateString("es-AR")}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Vencimiento</p>
            <p className="font-medium">{new Date(payable.dueDate).toLocaleDateString("es-AR")}</p>
          </div>
        </div>

        <hr />

        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Total original</p>
            <p className="font-medium tabular-nums">
              {Number(payable.originalAmount).toLocaleString("es-AR", { style: "currency", currency: payable.currency })}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Pagado</p>
            <p className="font-medium tabular-nums">
              {Number(payable.paidAmount).toLocaleString("es-AR", { style: "currency", currency: payable.currency })}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground font-semibold">Saldo pendiente</p>
            <p className="font-semibold tabular-nums">
              {Number(payable.balanceDue).toLocaleString("es-AR", { style: "currency", currency: payable.currency })}
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

      <div className="rounded-lg border bg-card">
        <div className="border-b px-6 py-4">
          <h2 className="font-semibold">Pagos registrados</h2>
        </div>
        <div className="p-6">
          <PaymentList payments={paymentItems} projectId={id} />
        </div>
      </div>
    </div>
  );
}
