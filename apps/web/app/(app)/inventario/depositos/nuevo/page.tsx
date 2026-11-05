import { redirect } from "next/navigation";
import { can } from "@bloqer/domain";
import { getCurrentUser } from "@/lib/auth";
import { getTenantModuleGate, listProjects, resolveActiveCompanyId } from "@bloqer/services";
import { WarehouseForm } from "@/features/inventory";
import { PageShell } from "@/components/layout/page-shell";

export default async function NuevoDepositoPage() {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");
  if (!can(current.tenantCtx.roles, "EDIT", "INVENTORY")) redirect("/inventario/depositos");

  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };
  const companyId = await resolveActiveCompanyId(ctx);
  const projects: { id: string; label: string }[] = [];
  const gate = await getTenantModuleGate(ctx);
  if (companyId && gate.isEnabled("PROJECTS") && can(ctx.roles, "VIEW", "PROJECTS")) {
    let page = 1;
    while (true) {
      const result = await listProjects({ page, pageSize: 100 }, { ...ctx, companyId });
      projects.push(
        ...result.data.map((project) => ({
          id: project.id,
          label: `[${project.code}] ${project.name}`,
        })),
      );
      if (page * 100 >= result.total || result.data.length === 0) break;
      page++;
    }
  }

  return (
    <PageShell variant="default" className="space-y-6">
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Nuevo depósito</h1>
      </div>

      {companyId ? (
        <div className="rounded-lg border bg-card p-6">
          <WarehouseForm companyId={companyId} projects={projects} />
        </div>
      ) : (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
          No hay una empresa activa en el tenant. Creá o activá una empresa antes de dar de alta
          depósitos.
        </p>
      )}
    </PageShell>
  );
}
