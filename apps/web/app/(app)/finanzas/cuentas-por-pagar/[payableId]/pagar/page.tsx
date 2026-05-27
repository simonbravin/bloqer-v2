import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PaymentForm } from "@/features/ap";
import { getCurrentUser } from "@/lib/auth";
import { PageShell } from "@/components/layout/page-shell";
import { PageBackLink } from "@/components/layout/page-back-link";
import { getCompanyPayableById, listTreasuryAccounts, ServiceError } from "@bloqer/services";

interface PageProps {
  params: Promise<{ payableId: string }>;
}

export default async function FinanzasPagarPage({ params }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { payableId } = await params;
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
      listTreasuryAccounts(ctx),
    ]);
    payable = payableResult;
    allAccounts = accountsResult.data;
  } catch (err) {
    if (err instanceof ServiceError && (err.code === "NOT_FOUND" || err.code === "FORBIDDEN"))
      notFound();
    throw err;
  }

  const activeAccounts = allAccounts
    .filter((a) => a.status === "ACTIVE")
    .map((a) => ({ id: a.id, name: a.name, currency: a.currency }));

  const isBlocked = payable.status === "PAID" || payable.status === "CANCELLED";

  return (
    <PageShell variant="form" className="space-y-6">
      <div className="flex items-center gap-4">
        <PageBackLink href={`/finanzas/cuentas-por-pagar/${payableId}`} label="Volver" />
        <h1 className="text-2xl font-bold tracking-tight">Registrar pago (empresa)</h1>
      </div>

      {isBlocked ? (
        <div className="rounded-lg border bg-card p-6">
          <p className="text-sm text-muted-foreground">
            Esta cuenta por pagar está en estado{" "}
            <strong>{payable.status === "PAID" ? "pagada" : "cancelada"}</strong> y no admite nuevos
            pagos.{" "}
            <Link
              href={`/finanzas/cuentas-por-pagar/${payableId}`}
              className="underline underline-offset-2"
            >
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
        />
      )}
    </PageShell>
  );
}
