import { redirect } from "next/navigation";
import { can } from "@bloqer/domain";
import { getCurrentUser } from "@/lib/auth";
import { getTenantModuleGate } from "@bloqer/services";
import { TenantReportsHub } from "@/features/reports";
import { PageShell } from "@/components/layout/page-shell";

export default async function TenantReportesPage() {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  const gate = await getTenantModuleGate(ctx);
  const canProjects = gate.isEnabled("PROJECTS") && can(ctx.roles, "VIEW", "PROJECTS");
  const canAr = gate.isEnabled("AR") && can(ctx.roles, "VIEW", "AR");
  const canAp = gate.isEnabled("AP") && can(ctx.roles, "VIEW", "AP");
  const canTreasury = gate.isEnabled("TREASURY") && can(ctx.roles, "VIEW", "TREASURY");
  const canInventory = gate.isEnabled("INVENTORY") && can(ctx.roles, "VIEW", "INVENTORY");
  const canProcurement =
    gate.isEnabled("PROCUREMENT") && can(ctx.roles, "VIEW", "PROJECTS");
  const canOverhead =
    gate.isEnabled("PROJECTS") &&
    (can(ctx.roles, "VIEW", "AP") || can(ctx.roles, "VIEW", "PROJECTS"));

  const hasAny =
    canProjects || canAr || canAp || canTreasury || canInventory || canProcurement || canOverhead;
  if (!hasAny) redirect("/dashboard");

  return (
    <PageShell variant="default" className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reportes</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Reportes consolidados a nivel empresa, agrupados en financieros y operativos.
        </p>
      </div>

      <TenantReportsHub
        canProjects={canProjects}
        canAr={canAr}
        canAp={canAp}
        canTreasury={canTreasury}
        canInventory={canInventory}
        canProcurement={canProcurement}
        canOverhead={canOverhead}
      />
    </PageShell>
  );
}
