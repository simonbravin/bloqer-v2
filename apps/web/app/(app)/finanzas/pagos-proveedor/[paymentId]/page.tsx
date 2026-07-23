import { formatDate } from "@/lib/format";
import { formatMoneyAmount } from "@/lib/format-money";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { ActionErrorBanner } from "@/components/feedback/action-error-banner";
import { getCurrentUser } from "@/lib/auth";
import { generateJournalFromPaymentAction } from "@/app/(app)/contabilidad/source-draft-actions";
import { getCompanyPaymentById, ServiceError } from "@bloqer/services";
import { can } from "@bloqer/domain";
import { cancelCompanyPaymentAction } from "@/app/(app)/finanzas/cuentas-por-pagar/actions";
import { redirectWithActionError } from "@/lib/procurement-action-redirect";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";

interface PageProps {
  params: Promise<{ paymentId: string }>;
  searchParams: Promise<{ contabilidad?: string; actionError?: string }>;
}

export default async function FinanzasPagoProveedorDetailPage({ params, searchParams }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { paymentId } = await params;
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
    payment = await getCompanyPaymentById(paymentId, ctx);
  } catch (err) {
    if (err instanceof ServiceError && (err.code === "NOT_FOUND" || err.code === "FORBIDDEN"))
      notFound();
    throw err;
  }

  const isConfirmed = payment.status === "CONFIRMED";
  const canEditAccounting = can(current.tenantCtx.roles, "EDIT", "ACCOUNTING");
  const canEditAp = can(current.tenantCtx.roles, "EDIT", "AP");
  const returnPath = `/finanzas/pagos-proveedor/${paymentId}`;

  return (
    <PageShell variant="form" className="space-y-6" breadcrumbLabel={formatDate(payment.paymentDate)}>
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Pago (empresa)</h1>
        <Badge variant={isConfirmed ? "default" : "destructive"}>
          {isConfirmed ? "Confirmado" : "Cancelado"}
        </Badge>
      </div>

      <ActionErrorBanner message={sp.actionError} />

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
              {formatMoneyAmount(payment.amount, payment.currency)}
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

      {canEditAp && isConfirmed && (
        <form
          action={async () => {
            "use server";
            const result = await cancelCompanyPaymentAction(paymentId);
            if ("error" in result) redirectWithActionError(returnPath, result.error);
            redirect(returnPath);
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
