import { redirect } from "next/navigation";
import { TreasuryHubView } from "@/features/treasury";
import { canEditBankAccountsUi } from "@/features/treasury/lib/treasury-edit-gates";
import { getCurrentUser } from "@/lib/auth";
import { getCashPositionReport, getTreasuryHubOverview, ServiceError } from "@bloqer/services";
import { can } from "@bloqer/domain";
import { PageShell } from "@/components/layout/page-shell";
import { CashPositionTable } from "@/features/treasury-reports";

export default async function TesoreriaPage() {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  if (!can(current.tenantCtx.roles, "VIEW", "TREASURY")) {
    redirect("/dashboard");
  }

  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId:    current.tenantCtx.tenantId,
    companyId:   current.tenantCtx.companyId,
    roles:       current.tenantCtx.roles,
  };

  let overview;
  let position;
  try {
    [overview, position] = await Promise.all([getTreasuryHubOverview(ctx), getCashPositionReport({}, ctx)]);
  } catch (err) {
    if (err instanceof ServiceError && (err.code === "FORBIDDEN" || err.code === "NOT_FOUND")) {
      redirect("/dashboard");
    }
    throw err;
  }

  const canCreateAccount = canEditBankAccountsUi(current.tenantCtx.roles);

  return (
    <PageShell variant="default" className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Tesorería</h1>

      <TreasuryHubView overview={overview} canCreateAccount={canCreateAccount} />
      {position.accounts.length > 0 ? (
        <section className="space-y-4" aria-labelledby="treasury-cash-position-title">
          <h2 id="treasury-cash-position-title" className="text-lg font-semibold">Posición de caja</h2>
          <CashPositionTable report={position} />
        </section>
      ) : null}
    </PageShell>
  );
}
