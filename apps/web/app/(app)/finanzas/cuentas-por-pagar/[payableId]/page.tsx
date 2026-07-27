import { formatDate } from "@/lib/format";
import { formatMoneyAmount } from "@/lib/format-money";
import Link from "next/link";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { DataTableSection } from "@/components/ui/data-table-section";
import { PayableStatusBadge, PaymentTable, RegisterCompanyPaymentDialog } from "@/features/ap";
import type { PaymentListItem } from "@/features/ap";
import { getCurrentUser } from "@/lib/auth";
import { PageShell } from "@/components/layout/page-shell";
import {
  getCompanyPayableById,
  listPaymentsByPayable,
  listSelectableTreasuryAccounts,
  canRegisterApPayment,
  ServiceError,
} from "@bloqer/services";
import { Button } from "@/components/ui/button";

interface PageProps {
  params: Promise<{ payableId: string }>;
  searchParams: Promise<{ pagar?: string }>;
}

export default async function FinanzasPayableDetailPage({ params, searchParams }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { payableId } = await params;
  const { pagar } = await searchParams;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  let payable;
  let payments;
  try {
    const [payableResult, paymentsResult] = await Promise.all([
      getCompanyPayableById(payableId, ctx),
      listPaymentsByPayable(payableId, ctx),
    ]);
    payable = payableResult;
    payments = paymentsResult;
  } catch (err) {
    if (err instanceof ServiceError && (err.code === "NOT_FOUND" || err.code === "FORBIDDEN"))
      notFound();
    throw err;
  }

  const canPay =
    canRegisterApPayment(ctx.roles) &&
    (payable.status === "OPEN" || payable.status === "PARTIAL" || payable.status === "OVERDUE");

  /** Only load treasury accounts when the dialog can actually open — avoid 404 if TREASURY is gated. */
  let activeAccounts: { id: string; name: string; currency: string }[] = [];
  if (canPay) {
    try {
      const accountsResult = await listSelectableTreasuryAccounts(ctx);
      activeAccounts = accountsResult
        .filter(
          (a) =>
            a.status === "ACTIVE" &&
            (!ctx.companyId || !a.companyId || a.companyId === ctx.companyId),
        )
        .map((a) => ({
          id: a.id,
          name: a.name,
          currency: a.currency,
        }));
    } catch (err) {
      if (!(err instanceof ServiceError && err.code === "FORBIDDEN")) throw err;
      // Detail remains usable; dialog will show empty-accounts messaging.
    }
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

  const openPagarDeepLink = pagar === "1";
  const blockedByStatus = payable.status === "PAID" || payable.status === "CANCELLED";

  return (
    <PageShell variant="detail" className="space-y-6" breadcrumbLabel={payable.supplierName}>
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Cuenta por pagar (empresa)</h1>
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
              {formatMoneyAmount(payable.originalAmount, payable.currency)}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Pagado</p>
            <p className="font-medium tabular-nums">
              {formatMoneyAmount(payable.paidAmount, payable.currency)}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground font-semibold">Saldo pendiente</p>
            <p className="font-semibold tabular-nums">
              {formatMoneyAmount(payable.balanceDue, payable.currency)}
            </p>
          </div>
        </div>

        <Button asChild variant="outline">
          <Link href={`/finanzas/facturas-proveedor/${payable.supplierInvoiceId}`}>
            Ver factura →
          </Link>
        </Button>
      </div>

      {canPay ? (
        <div className="flex justify-end">
          <Suspense fallback={<Button disabled>Registrar pago</Button>}>
            <RegisterCompanyPaymentDialog
              payableId={payableId}
              payableBalance={payable.balanceDue}
              payableCurrency={payable.currency}
              accounts={activeAccounts}
              defaultOpen={openPagarDeepLink}
            />
          </Suspense>
        </div>
      ) : openPagarDeepLink && blockedByStatus ? (
        <p className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
          Esta cuenta por pagar está en estado{" "}
          <strong>{payable.status === "PAID" ? "pagada" : "cancelada"}</strong> y no admite nuevos
          pagos.
        </p>
      ) : payable.status === "OPEN" ||
        payable.status === "PARTIAL" ||
        payable.status === "OVERDUE" ? (
        <p className="text-right text-sm text-muted-foreground">
          El pago lo registra finanzas o tesorería (elige la cuenta bancaria).
        </p>
      ) : null}

      <DataTableSection title="Pagos registrados">
        <PaymentTable payments={paymentItems} hrefPrefix="/finanzas/pagos-proveedor" />
      </DataTableSection>
    </PageShell>
  );
}
