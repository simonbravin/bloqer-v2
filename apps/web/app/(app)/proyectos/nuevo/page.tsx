import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ProjectForm } from "@/features/projects";
import { getCurrentUser } from "@/lib/auth";
import { listContacts } from "@bloqer/services";
import { createProjectAction } from "../actions";

export default async function NuevoProyectoPage() {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  const { data: clients } = await listContacts({ role: "CLIENT", status: "ACTIVE", pageSize: 100 }, ctx);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/proyectos">← Volver</Link>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">Nuevo proyecto</h1>
      </div>

      <div className="rounded-lg border bg-card p-6">
        <ProjectForm
          clients={clients.map((c) => ({
            id: c.id,
            legalName: c.legalName,
            fantasyName: c.fantasyName ?? null,
          }))}
          onSubmit={createProjectAction}
        />
      </div>
    </div>
  );
}
