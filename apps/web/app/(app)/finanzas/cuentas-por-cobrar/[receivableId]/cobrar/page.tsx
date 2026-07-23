import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CollectionForm } from "@/features/collections";
import { getCurrentUser } from "@/lib/auth";
import { PageShell } from "@/components/layout/page-shell";
import { can } from "@bloqer/domain";
import { getCompanyReceivableById, listTreasuryAccounts, ServiceError } from "@bloqer/services";

interface PageProps {
  params: Promise<{ receivableId: string }>;
}

export default async function FinanzasCobrarReceivablePage({ params }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { receivableId } = await params;
  if (!can(current.tenantCtx.roles, "EDIT", "AR")) {
    redirect(`/finanzas/cuentas-por-cobrar/${receivableId}`);
  }

  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  let receivable;
  let allAccounts;
  try {
    const [receivableResult, accountsResult] = await Promise.all([
      getCompanyReceivableById(receivableId, ctx),
      listTreasuryAccounts(ctx),
    ]);
    receivable = receivableResult;
    allAccounts = accountsResult.data;
  } catch (err) {
    if (err instanceof ServiceError && (err.code === "NOT_FOUND" || err.code === "FORBIDDEN")) {
      notFound();
    }
    throw err;
  }

  const activeAccounts = allAccounts
    .filter((a) => a.status === "ACTIVE")
    .map((a) => ({ id: a.id, name: a.name, currency: a.currency }));

  const isBlocked = receivable.status === "PAID" || receivable.status === "CANCELLED";

  return (
    <PageShell
      variant="form"
      className="space-y-6"
      breadcrumbSegmentLabels={{ [receivableId]: receivable.clientName }}
    >
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Registrar cobro (empresa)</h1>
      </div>

      {isBlocked ? (
        <div className="rounded-lg border bg-card p-6">
          <p className="text-sm text-muted-foreground">
            Esta cuenta por cobrar está en estado{" "}
            <strong>{receivable.status === "PAID" ? "cobrada" : "cancelada"}</strong> y no admite
            nuevos cobros.{" "}
            <Link
              href={`/finanzas/cuentas-por-cobrar/${receivableId}`}
              className="underline underline-offset-2"
            >
              Ver detalle
            </Link>
          </p>
        </div>
      ) : (
        <CollectionForm
          companyFinanzas
          receivableId={receivableId}
          receivableBalance={receivable.balanceDue}
          receivableCurrency={receivable.currency}
          accounts={activeAccounts}
        />
      )}
    </PageShell>
  );
}
