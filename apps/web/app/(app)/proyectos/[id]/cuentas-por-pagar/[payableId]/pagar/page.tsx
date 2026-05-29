import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PaymentForm } from "@/features/ap";
import { getCurrentUser } from "@/lib/auth";
import { PageShell } from "@/components/layout/page-shell";
import { PageBackLink } from "@/components/layout/page-back-link";
import { getPayableById, listTreasuryAccounts, ServiceError } from "@bloqer/services";

interface PageProps {
  params: Promise<{ id: string; payableId: string }>;
}

export default async function PagarPage({ params }: PageProps) {
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
  let allAccounts;
  try {
    const [payableResult, accountsResult] = await Promise.all([
      getPayableById(payableId, ctx, id),
      listTreasuryAccounts(ctx),
    ]);
    payable = payableResult;
    allAccounts = accountsResult.data;
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
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
    <PageShell variant="default" className="space-y-6">
      <div className="flex items-center gap-4">
        <PageBackLink href={`/proyectos/${id}/cuentas-por-pagar/${payableId}`} label="Volver" />
        <h1 className="text-2xl font-bold tracking-tight">Registrar pago</h1>
      </div>

      {isBlocked ? (
        <div className="rounded-lg border bg-card p-6">
          <p className="text-sm text-muted-foreground">
            Esta cuenta por pagar está en estado{" "}
            <strong>{payable.status === "PAID" ? "pagada" : "cancelada"}</strong> y no admite nuevos
            pagos.{" "}
            <Link
              href={`/proyectos/${id}/cuentas-por-pagar/${payableId}`}
              className="underline underline-offset-2"
            >
              Ver detalle
            </Link>
          </p>
        </div>
      ) : (
        <PaymentForm
          projectId={id}
          payableId={payableId}
          payableBalance={payable.balanceDue}
          payableCurrency={payable.currency}
          accounts={activeAccounts}
        />
      )}
    </PageShell>
  );
}
