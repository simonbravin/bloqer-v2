import { formatDate, formatDateTime } from "@/lib/format";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getCurrentUser } from "@/lib/auth";
import { generateJournalFromPaymentAction } from "@/app/(app)/contabilidad/source-draft-actions";
import { getCompanyPaymentById, ServiceError } from "@bloqer/services";
import { can } from "@bloqer/domain";
import { cancelCompanyPaymentAction } from "@/app/(app)/finanzas/cuentas-por-pagar/actions";

interface PageProps {
  params: Promise<{ paymentId: string }>;
  searchParams: Promise<{ contabilidad?: string }>;
}

export default async function FinanzasPagoProveedorDetailPage({ params, searchParams }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { paymentId } = await params;
  const sp = await searchParams;
  const contabilidadErr = sp.contabilidad;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId:    current.tenantCtx.tenantId,
    companyId:   current.tenantCtx.companyId,
    roles:       current.tenantCtx.roles,
  };

  let payment;
  try {
    payment = await getCompanyPaymentById(paymentId, ctx);
  } catch (err) {
    if (err instanceof ServiceError && (err.code === "NOT_FOUND" || err.code === "FORBIDDEN")) notFound();
    throw err;
  }

  const isConfirmed = payment.status === "CONFIRMED";
  const canEditAccounting = can(current.tenantCtx.roles, "EDIT", "ACCOUNTING");
  const returnPath = `/finanzas/pagos-proveedor/${paymentId}`;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/finanzas/cuentas-por-pagar">← Cuentas por pagar empresa</Link>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">Pago (empresa)</h1>
        <Badge variant={isConfirmed ? "default" : "destructive"}>
          {isConfirmed ? "Confirmado" : "Cancelado"}
        </Badge>
      </div>

      <p className="text-sm text-muted-foreground rounded-md border border-dashed bg-muted/30 px-3 py-2">
        Pago de cuenta por pagar <strong>sin proyecto</strong>. No hay enlace a obra.
      </p>

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
              {Number(payment.amount).toLocaleString("es-AR", { style: "currency", currency: payment.currency })}
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
            <Link href={`/finanzas/cuentas-por-pagar/${payment.payableId}`}>
              Ver cuenta por pagar →
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
            Generá un asiento en borrador según la regla activa para pagos confirmados. El posteo es manual en Contabilidad.
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
            await cancelCompanyPaymentAction(paymentId);
            redirect(returnPath);
          }}
        >
          <Button type="submit" variant="destructive">Cancelar pago</Button>
        </form>
      )}
    </div>
  );
}
