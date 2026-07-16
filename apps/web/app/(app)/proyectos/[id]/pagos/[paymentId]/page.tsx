import { formatDate, formatDateTime } from "@/lib/format";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { getCurrentUser } from "@/lib/auth";
import { generateJournalFromPaymentAction } from "@/app/(app)/contabilidad/source-draft-actions";
import { getPaymentById, ServiceError } from "@bloqer/services";
import { can } from "@bloqer/domain";
import { cancelPaymentAction } from "@/app/(app)/proyectos/[id]/cuentas-por-pagar/actions";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";

interface PageProps {
  params: Promise<{ id: string; paymentId: string }>;
  searchParams: Promise<{ contabilidad?: string }>;
}

export default async function PaymentDetailPage({ params, searchParams }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id, paymentId } = await params;
  const sp = await searchParams;
  const contabilidadErr = sp.contabilidad;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  let payment;
  try {
    payment = await getPaymentById(paymentId, ctx, id);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  const isConfirmed = payment.status === "CONFIRMED";
  const canEditAccounting = can(current.tenantCtx.roles, "EDIT", "ACCOUNTING");
  const returnPath = `/proyectos/${id}/pagos/${paymentId}`;

  return (
    <PageShell variant="default" className="space-y-6" breadcrumbLabel={formatDate(payment.paymentDate)}>
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Pago</h1>
        <Badge variant={isConfirmed ? "default" : "destructive"}>
          {isConfirmed ? "Confirmado" : "Cancelado"}
        </Badge>
      </div>

      <div className="rounded-lg border bg-card p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Cuenta de tesorería</p>
            <p className="font-medium">{payment.accountName}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Moneda</p>
            <p className="font-medium">{payment.currency}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Fecha de pago</p>
            <p className="font-medium">{formatDate(payment.paymentDate)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Monto</p>
            <p className="font-semibold tabular-nums">
              {Number(payment.amount).toLocaleString("es-AR", {
                style: "currency",
                currency: payment.currency,
              })}
            </p>
          </div>
        </div>

        {payment.notes && (
          <div>
            <p className="text-sm text-muted-foreground">Notas</p>
            <p className="text-sm">{payment.notes}</p>
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <Button asChild variant="outline">
            <Link href={`/proyectos/${id}/cuentas-por-pagar/${payment.payableId}`}>
              Ver cuenta por pagar →
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/proyectos/${id}/facturas-proveedor/${payment.supplierInvoiceId}`}>
              Ver factura proveedor →
            </Link>
          </Button>
        </div>
      </div>

      {contabilidadErr && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {contabilidadErr}
        </p>
      )}

      {canEditAccounting && isConfirmed && (
        <div className="rounded-lg border bg-card p-6 space-y-3">
          <h2 className="font-semibold">Contabilidad</h2>
          <p className="text-sm text-muted-foreground">
            Generá un asiento en borrador según la regla activa para pagos confirmados. El posteo es
            manual en Contabilidad.
          </p>
          <form action={generateJournalFromPaymentAction.bind(null, paymentId, returnPath)}>
            <Button type="submit" variant="outline">
              Generar asiento contable
            </Button>
          </form>
        </div>
      )}

      {isConfirmed && (
        <form
          action={async () => {
            "use server";
            await cancelPaymentAction(paymentId, id);
            redirect(`/proyectos/${id}/pagos/${paymentId}`);
          }}
        >
          <Button type="submit" variant="destructive">
            Cancelar pago
          </Button>
        </form>
      )}
    </PageShell>
  );
}
