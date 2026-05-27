import { notFound, redirect } from "next/navigation";
import { BudgetForm } from "@/features/budgets";
import { getCurrentUser } from "@/lib/auth";
import { getProjectShellInfo, ServiceError } from "@bloqer/services";
import { createBudgetAction } from "../actions";
import { PageShell } from "@/components/layout/page-shell";
import { ProjectPageHeader } from "@/components/layout/project-page-header";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function NuevoPresupuestoPage({ params }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id: projectId } = await params;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  let project;
  try {
    project = await getProjectShellInfo(projectId, ctx);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    if (err instanceof ServiceError && err.code === "FORBIDDEN") redirect("/dashboard");
    throw err;
  }

  return (
    <PageShell variant="default" className="space-y-6">
      <ProjectPageHeader
        projectId={projectId}
        projectName={project.name}
        title="Nuevo presupuesto"
        subtitle="Alta de una nueva versión de presupuesto"
      />
      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <BudgetForm
          projectId={projectId}
          onSubmit={createBudgetAction.bind(null, projectId)}
        />
      </div>
    </PageShell>
  );
}
