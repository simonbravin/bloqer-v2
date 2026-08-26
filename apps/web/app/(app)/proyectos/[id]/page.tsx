import { notFound, redirect } from "next/navigation";
import { can } from "@bloqer/domain";
import {
  getProjectById,
  getProjectOverviewDashboard,
  canCancelActiveProject,
  canReactivateProject,
  listProjectTeam,
  listActiveMembersForProjectTeamPicker,
  ServiceError,
} from "@bloqer/services";
import { PageShell } from "@/components/layout/page-shell";
import { getCurrentUser } from "@/lib/auth";
import { ProjectOverviewView } from "@/features/projects/overview/project-overview-view";
import { ProjectLifecycleActions } from "@/features/projects/components/project-lifecycle-actions";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ProyectoDetailPage({ params }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id } = await params;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  let dashboard;
  try {
    dashboard = await getProjectOverviewDashboard(ctx, id);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    if (err instanceof ServiceError && err.code === "FORBIDDEN") redirect("/dashboard");
    throw err;
  }

  let fullProject = null;
  if (can(current.tenantCtx.roles, "VIEW", "PROJECTS")) {
    try {
      fullProject = await getProjectById(id, ctx);
    } catch (err) {
      if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
      if (err instanceof ServiceError && err.code === "FORBIDDEN") redirect("/dashboard");
      throw err;
    }
  }

  const project = fullProject;
  const roles = current.tenantCtx.roles;
  const canEditTeam = can(roles, "EDIT", "PROJECTS");
  const canViewTeam = can(roles, "VIEW", "PROJECTS") || canEditTeam;

  let teamMembers: Awaited<ReturnType<typeof listProjectTeam>> = [];
  let teamPickerOptions: Awaited<ReturnType<typeof listActiveMembersForProjectTeamPicker>> = [];
  if (canViewTeam) {
    try {
      teamMembers = await listProjectTeam(id, ctx);
      if (canEditTeam) {
        teamPickerOptions = await listActiveMembersForProjectTeamPicker(id, ctx);
      }
    } catch (err) {
      if (!(err instanceof ServiceError && err.code === "FORBIDDEN")) throw err;
    }
  }

  const lifecycleActions =
    project ? (
      <ProjectLifecycleActions
        projectId={id}
        status={project.status}
        canEditProject={canEditTeam}
        canCancelActive={canCancelActiveProject(roles)}
        canReactivate={canReactivateProject(roles)}
      />
    ) : null;

  return (
    <PageShell variant="default" className="space-y-8">
      <ProjectOverviewView
        dashboard={dashboard}
        projectId={id}
        fullProject={fullProject}
        lifecycleActions={lifecycleActions}
        team={{
          members: teamMembers.map((m) => ({
            id: m.id,
            userId: m.userId,
            email: m.email,
            name: m.name,
            kind: m.kind,
            membershipActive: m.membershipActive,
            canSuperviseJobsiteLog: m.canSuperviseJobsiteLog,
          })),
          pickerOptions: teamPickerOptions.map((o) => ({
            userId: o.userId,
            email: o.email,
            name: o.name,
          })),
          canEdit: canEditTeam,
          visible: canViewTeam,
        }}
      />
    </PageShell>
  );
}
