import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { PaymentForm } from "@/features/ap";
import { getCurrentUser } from "@/lib/auth";
import { PageShell } from "@/components/layout/page-shell";
import {
  canRegisterApPayment,
  getCompanyPayableById,
  listSelectableTreasuryAccounts,
  ServiceError,
} from "@bloqer/services";
import { isPayablesFieldViewport, parseViewportHint, VIEWPORT_COOKIE } from "@/lib/viewport-hint-cookie";

interface PageProps {
  params: Promise<{ payableId: string }>;
}

/** Desktop: legacy `/pagar` → detail dialog (`?pagar=1`). Field: dedicated form. */
export default async function FinanzasPagarPage({ params }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { payableId } = await params;
  const detailHref = `/finanzas/cuentas-por-pagar/${payableId}`;

  if (!canRegisterApPayment(current.tenantCtx.roles)) {
    redirect(detailHref);
  }

  const hint = parseViewportHint((await cookies()).get(VIEWPORT_COOKIE)?.value);
  const fieldMode = isPayablesFieldViewport(hint);
  if (!fieldMode) {
    redirect(`${detailHref}?pagar=1`);
  }

  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  let payable;
  let allAccounts;
  try {
    const [payableResult, accountsResult] = await Promise.all([
      getCompanyPayableById(payableId, ctx),
      listSelectableTreasuryAccounts(ctx),
    ]);
    payable = payableResult;
    allAccounts = accountsResult;
  } catch (err) {
    if (err instanceof ServiceError && (err.code === "NOT_FOUND" || err.code === "FORBIDDEN")) notFound();
    throw err;
  }

  const activeAccounts = allAccounts
    .filter(
      (a) =>
        a.status === "ACTIVE" && (!ctx.companyId || !a.companyId || a.companyId === ctx.companyId),
    )
    .map((a) => ({ id: a.id, name: a.name, currency: a.currency }));

  const isBlocked = payable.status === "PAID" || payable.status === "CANCELLED";

  return (
    <PageShell
      variant="form"
      className="space-y-6"
      breadcrumbSegmentLabels={{ [payableId]: payable.supplierName }}
    >
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Registrar pago</h1>
      </div>

      <p className="text-sm text-muted-foreground">
        Elegí la cuenta de tesorería de la empresa. El débito se registra al confirmar el pago.
      </p>

      {isBlocked ? (
        <div className="rounded-lg border bg-card p-6">
          <p className="text-sm text-muted-foreground">
            Esta cuenta por pagar está en estado{" "}
            <strong>{payable.status === "PAID" ? "pagada" : "cancelada"}</strong> y no admite nuevos
            pagos.{" "}
            <Link href={detailHref} className="underline underline-offset-2">
              Ver detalle
            </Link>
          </p>
        </div>
      ) : (
        <PaymentForm
          companyFinanzas
          payableId={payableId}
          payableBalance={payable.balanceDue}
          payableCurrency={payable.currency}
          accounts={activeAccounts}
          fieldMode
          supplierName={payable.supplierName}
          successHref={`${detailHref}?paid=1`}
        />
      )}
    </PageShell>
  );
}
