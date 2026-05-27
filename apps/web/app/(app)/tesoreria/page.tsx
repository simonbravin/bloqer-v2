import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { TreasurySummaryCards } from "@/features/treasury";
import { getCurrentUser } from "@/lib/auth";
import { getTreasurySummaryByCompany } from "@bloqer/services";
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

  const summaries = await getTreasurySummaryByCompany(ctx);

  return (
    <PageShell variant="default" className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Tesorería</h1>
      </div>

      <TreasurySummaryCards summaries={summaries} />

      <div className="flex gap-3">
        <Button asChild>
          <Link href="/tesoreria/cuentas">Ver cuentas</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/tesoreria/transferencias">Ver transferencias</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/tesoreria/reportes">Reportes</Link>
        </Button>
      </div>
    </PageShell>
  );
}
