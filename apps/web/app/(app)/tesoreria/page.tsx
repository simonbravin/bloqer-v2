import { redirect } from "next/navigation";
import { TreasuryHubView } from "@/features/treasury";
import { getCurrentUser } from "@/lib/auth";
import { getTreasuryHubOverview, ServiceError } from "@bloqer/services";
import { can } from "@bloqer/domain";
import { PageShell } from "@/components/layout/page-shell";

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
  try {
    overview = await getTreasuryHubOverview(ctx);
  } catch (err) {
    if (err instanceof ServiceError && (err.code === "FORBIDDEN" || err.code === "NOT_FOUND")) {
      redirect("/dashboard");
    }
    throw err;
  }

  const canCreateAccount = can(current.tenantCtx.roles, "EDIT", "TREASURY");

  return (
    <PageShell variant="default" className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Tesorería</h1>

      <TreasuryHubView overview={overview} canCreateAccount={canCreateAccount} />
    </PageShell>
  );
}
