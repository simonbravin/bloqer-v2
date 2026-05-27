import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CertificationForm } from "@/features/certifications";
import { getCurrentUser } from "@/lib/auth";
import { listBudgetsByProject, getProjectShellInfo, ServiceError } from "@bloqer/services";
import { createCertificationAction } from "../actions";
import { PageShell } from "@/components/layout/page-shell";
import { ProjectPageHeader } from "@/components/layout/project-page-header";
import { Button } from "@/components/ui/button";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function NuevaCertificacionPage({ params }: PageProps) {
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

  const allBudgets = await listBudgetsByProject(projectId, ctx);
  const eligibleBudgets = allBudgets.filter(
    (b) => b.status === "APPROVED" || b.status === "CLOSED",
  );

  if (eligibleBudgets.length === 0) {
    return (
      <PageShell variant="form" className="space-y-6">
        <ProjectPageHeader
          projectId={projectId}
          projectName={project.name}
          title="Nueva certificación"
          subtitle="Certificación de avance de obra"
        />
        <div className="rounded-xl border bg-card px-6 py-8 text-center text-sm text-muted-foreground shadow-sm">
          <p>No hay presupuestos aprobados para este proyecto.</p>
          <p className="mt-1">Apruebe un presupuesto antes de crear una certificación.</p>
          <Button variant="outline" size="sm" className="mt-4" asChild>
            <Link href={`/proyectos/${projectId}/presupuestos`}>Ver presupuestos</Link>
          </Button>
        </div>
      </PageShell>
    );
  }

  const budgetOptions = eligibleBudgets.map((b) => ({
    id: b.id,
    name: b.name,
    versionNumber: b.versionNumber,
    status: b.status,
  }));

  return (
    <PageShell variant="form" className="space-y-6">
      <ProjectPageHeader
        projectId={projectId}
        projectName={project.name}
        title="Nueva certificación"
        subtitle="Certificación de avance de obra"
      />

      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <CertificationForm
          projectId={projectId}
          budgets={budgetOptions}
          defaultBudgetId={budgetOptions.length === 1 ? budgetOptions[0].id : undefined}
          onSubmit={createCertificationAction.bind(null, projectId)}
        />
      </div>
    </PageShell>
  );
}
