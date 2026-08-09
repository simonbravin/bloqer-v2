import { notFound, redirect } from "next/navigation";
import { ManualTreasuryAdjustmentForm } from "@/features/treasury";
import { canEditTreasuryUi } from "@/features/treasury/lib/treasury-edit-gates";
import { getCurrentUser } from "@/lib/auth";
import { getTreasuryAccountById, ServiceError } from "@bloqer/services";
import { PageShell } from "@/components/layout/page-shell";

interface PageProps {
  params: Promise<{ accountId: string }>;
}

export default async function ManualTreasuryAdjustmentPage({ params }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { accountId } = await params;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  if (!canEditTreasuryUi(ctx.roles)) {
    redirect(`/tesoreria/cuentas/${accountId}`);
  }

  let account;
  try {
    account = await getTreasuryAccountById(accountId, ctx);
  } catch (err) {
    if (err instanceof ServiceError && (err.code === "NOT_FOUND" || err.code === "FORBIDDEN")) {
      notFound();
    }
    throw err;
  }

  if (account.status !== "ACTIVE") {
    redirect(`/tesoreria/cuentas/${accountId}`);
  }

  return (
    <PageShell variant="default" className="space-y-6" breadcrumbLabel="Ajuste manual">
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Ajuste de cuenta</h1>
      </div>
      <ManualTreasuryAdjustmentForm
        accountId={account.id}
        accountName={account.name}
        currency={account.currency}
      />
    </PageShell>
  );
}
