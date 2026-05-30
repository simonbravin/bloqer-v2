import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { can } from "@bloqer/domain";
import {
  getProjectById,
  getProjectOverviewDashboard,
  canCancelActiveProject,
  canReactivateProject,
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

  const lifecycleActions =
    project ? (
      <ProjectLifecycleActions
        projectId={id}
        status={project.status}
        canEditProject={can(roles, "EDIT", "PROJECTS")}
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
      />
    </PageShell>
  );
}
