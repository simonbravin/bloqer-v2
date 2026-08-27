import { notFound, redirect } from "next/navigation";
import { can } from "@bloqer/domain";
import { ProjectForm, ProjectTeamCard } from "@/features/projects";
import { getCurrentUser } from "@/lib/auth";
import {
  getProjectById,
  isProjectTypeLocked,
  listAllContacts,
  listActiveMembersForProjectTeamPicker,
  listProjectTeam,
  ServiceError,
} from "@bloqer/services";
import { updateProjectAction } from "../../actions";
import type { ProjectFormInput } from "@bloqer/validators";
import { toDateInput } from "@/lib/date-input";
import { PageShell } from "@/components/layout/page-shell";
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

  if (!can(ctx.roles, "EDIT", "PROJECTS")) {
    redirect(`/proyectos/${id}`);
  }

  let project;
  try {
    project = await getProjectById(id, ctx);
  } catch (err) {
    if (err instanceof ServiceError && (err.code === "NOT_FOUND" || err.code === "FORBIDDEN")) notFound();
    throw err;
  }

  if (project.status === "COMPLETED" || project.status === "CANCELLED")
    redirect(`/proyectos/${id}`);

  const [typeLocked, listedClients] = await Promise.all([
    isProjectTypeLocked(id, ctx),
    listAllContacts({ role: "CLIENT", status: "ACTIVE" }, ctx).catch((err: unknown) => {
      if (err instanceof ServiceError && err.code === "FORBIDDEN") return [];
      throw err;
    }),
  ]);

  const clients = listedClients.map((c) => ({
    id: c.id,
    legalName: c.legalName,
    fantasyName: c.fantasyName ?? null,
  }));
  if (!clients.some((c) => c.id === project.clientContactId)) {
    clients.unshift({
      id: project.client.id,
      legalName: project.client.legalName,
      fantasyName: project.client.fantasyName ?? null,
    });
  }

  let teamMembers: Awaited<ReturnType<typeof listProjectTeam>> = [];
  let teamPickerOptions: Awaited<ReturnType<typeof listActiveMembersForProjectTeamPicker>> = [];
  try {
    [teamMembers, teamPickerOptions] = await Promise.all([
      listProjectTeam(id, ctx),
      listActiveMembersForProjectTeamPicker(id, ctx),
    ]);
  } catch (err) {
    if (!(err instanceof ServiceError && err.code === "FORBIDDEN")) throw err;
  }

  const defaultValues: Partial<ProjectFormInput> = {
    code: project.code,
    name: project.name,
    description: project.description ?? undefined,
    clientContactId: project.clientContactId,
    type: project.type,
    address: project.address ?? undefined,
    city: project.city ?? undefined,
    province: project.province ?? undefined,
    country: project.country,
    startDate: project.startDate ? toDateInput(project.startDate) : undefined,
    expectedEndDate: project.expectedEndDate ? toDateInput(project.expectedEndDate) : undefined,
    notes: project.notes ?? undefined,
  };

  return (
    <PageShell variant="default" className="space-y-6" breadcrumbLabel={project.name}>
      <PageListHeader title="Editar proyecto" subtitle="Datos generales de la obra y equipo" />

      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <ProjectForm
          clients={clients}
          defaultValues={defaultValues}
          submitLabel="Guardar cambios"
          successRedirect={`/proyectos/${id}`}
          typeLocked={typeLocked}
          onSubmit={updateProjectAction.bind(null, id)}
        />
      </div>

      <ProjectTeamCard
        projectId={id}
        members={teamMembers.map((m) => ({
          id: m.id,
          userId: m.userId,
          email: m.email,
          name: m.name,
          kind: m.kind,
          membershipActive: m.membershipActive,
          canSuperviseJobsiteLog: m.canSuperviseJobsiteLog,
        }))}
        pickerOptions={teamPickerOptions.map((o) => ({
          userId: o.userId,
          email: o.email,
          name: o.name,
        }))}
        canEdit
      />
    </PageShell>
  );
}
