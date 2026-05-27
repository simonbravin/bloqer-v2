import { redirect } from "next/navigation";
import { ProjectForm } from "@/features/projects";
import { getCurrentUser } from "@/lib/auth";
import { listContacts } from "@bloqer/services";
import { createProjectAction } from "../actions";
import { PageShell } from "@/components/layout/page-shell";
import { PageListHeader } from "@/components/ui/page-list-header";
import { PageBackLink } from "@/components/layout/page-back-link";

export default async function NuevoProyectoPage() {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  const { data: clients } = await listContacts(
    { role: "CLIENT", status: "ACTIVE", pageSize: 100 },
    ctx,
  );

  return (
    <PageShell variant="default" className="space-y-6">
      <PageBackLink href="/proyectos" label="Proyectos" />
      <PageListHeader title="Nuevo proyecto" subtitle="Alta de obra" />

      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <ProjectForm
          clients={clients.map((c) => ({
            id: c.id,
            legalName: c.legalName,
            fantasyName: c.fantasyName ?? null,
          }))}
          onSubmit={createProjectAction}
        />
      </div>
    </PageShell>
  );
}
