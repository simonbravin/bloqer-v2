import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ProjectForm } from "@/features/projects";
import { getCurrentUser } from "@/lib/auth";
import { getProjectById, listContacts, ServiceError } from "@bloqer/services";
import { updateProjectAction } from "../../actions";
import type { CreateProjectInput } from "@bloqer/validators";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditarProyectoPage({ params }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id } = await params;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  let project;
  try {
    project = await getProjectById(id, ctx);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  if (project.status === "COMPLETED" || project.status === "CANCELLED") redirect(`/proyectos/${id}`);

  const { data: clients } = await listContacts({ role: "CLIENT", status: "ACTIVE", pageSize: 100 }, ctx);

  const defaultValues: Partial<CreateProjectInput> = {
    code: project.code,
    name: project.name,
    description: project.description ?? undefined,
    clientContactId: project.clientContactId,
    type: project.type,
    address: project.address ?? undefined,
    city: project.city ?? undefined,
    province: project.province ?? undefined,
    country: project.country,
    startDate: project.startDate ?? undefined,
    expectedEndDate: project.expectedEndDate ?? undefined,
    notes: project.notes ?? undefined,
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/proyectos/${id}`}>← Volver</Link>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">Editar proyecto</h1>
      </div>

      <div className="rounded-lg border bg-card p-6">
        <ProjectForm
          clients={clients.map((c) => ({
            id: c.id,
            legalName: c.legalName,
            fantasyName: c.fantasyName ?? null,
          }))}
          defaultValues={defaultValues}
          submitLabel="Guardar cambios"
          successRedirect={`/proyectos/${id}`}
          onSubmit={(data) => updateProjectAction(id, data)}
        />
      </div>
    </div>
  );
}
