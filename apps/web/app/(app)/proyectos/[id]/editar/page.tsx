import { notFound, redirect } from "next/navigation";
import { ProjectForm } from "@/features/projects";
import { getCurrentUser } from "@/lib/auth";
import { getProjectById, listContacts, ServiceError } from "@bloqer/services";
import { updateProjectAction } from "../../actions";
import type { CreateProjectInput } from "@bloqer/validators";
import { PageShell } from "@/components/layout/page-shell";
import { PageBackLink } from "@/components/layout/page-back-link";
import { PageListHeader } from "@/components/ui/page-list-header";

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

  if (project.status === "COMPLETED" || project.status === "CANCELLED")
    redirect(`/proyectos/${id}`);

  const { data: clients } = await listContacts(
    { role: "CLIENT", status: "ACTIVE", pageSize: 100 },
    ctx,
  );

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
    <PageShell variant="form" className="space-y-6">
      <PageBackLink href={`/proyectos/${id}`} label={project.name} />
      <PageListHeader title="Editar proyecto" subtitle="Datos generales de la obra" />

      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <ProjectForm
          clients={clients.map((c) => ({
            id: c.id,
            legalName: c.legalName,
            fantasyName: c.fantasyName ?? null,
          }))}
          defaultValues={defaultValues}
          submitLabel="Guardar cambios"
          successRedirect={`/proyectos/${id}`}
          onSubmit={updateProjectAction.bind(null, id)}
        />
      </div>
    </PageShell>
  );
}
