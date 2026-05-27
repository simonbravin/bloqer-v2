import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { can } from "@bloqer/domain";
import {
  getProjectById,
  getProjectOverviewDashboard,
  ServiceError,
} from "@bloqer/services";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/layout/page-shell";
import { getCurrentUser } from "@/lib/auth";
import { ProjectOverviewView } from "@/features/projects/overview/project-overview-view";
import {
  activateProjectAction,
  pauseProjectAction,
  resumeProjectAction,
  completeProjectAction,
  cancelProjectAction,
} from "../actions";

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
  const isTerminal = project?.status === "COMPLETED" || project?.status === "CANCELLED";

  const doActivate = async () => {
    "use server";
    await activateProjectAction(id);
  };
  const doPause = async () => {
    "use server";
    await pauseProjectAction(id);
  };
  const doResume = async () => {
    "use server";
    await resumeProjectAction(id);
  };
  const doComplete = async () => {
    "use server";
    await completeProjectAction(id);
  };
  const doCancel = async () => {
    "use server";
    await cancelProjectAction(id);
  };

  const lifecycleActions =
    project ? (
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
        {!isTerminal && (
          <Button variant="outline" size="sm" asChild>
            <Link href={`/proyectos/${id}/editar`}>Editar</Link>
          </Button>
        )}
        {project.status === "DRAFT" && (
          <form action={doActivate}>
            <Button size="sm">Activar</Button>
          </form>
        )}
        {project.status === "ACTIVE" && (
          <>
            <form action={doPause}>
              <Button variant="outline" size="sm">
                Pausar
              </Button>
            </form>
            <form action={doComplete}>
              <Button variant="outline" size="sm">
                Completar
              </Button>
            </form>
          </>
        )}
        {project.status === "ON_HOLD" && (
          <form action={doResume}>
            <Button size="sm">Reanudar</Button>
          </form>
        )}
        {!isTerminal && (
          <form action={doCancel}>
            <Button variant="ghost" size="sm" className="text-muted-foreground">
              Cancelar proyecto
            </Button>
          </form>
        )}
      </div>
    ) : null;

  return (
    <PageShell>
      <ProjectOverviewView
        dashboard={dashboard}
        projectId={id}
        fullProject={fullProject}
        lifecycleActions={lifecycleActions}
      />
    </PageShell>
  );
}
