import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CertificationForm } from "@/features/certifications";
import { getCurrentUser } from "@/lib/auth";
import { listBudgetsByProject, getProjectById, ServiceError } from "@bloqer/services";
import { createCertificationAction } from "../actions";

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
    project = await getProjectById(projectId, ctx);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  const allBudgets = await listBudgetsByProject(projectId, ctx);
  const eligibleBudgets = allBudgets.filter(
    (b) => b.status === "APPROVED" || b.status === "CLOSED",
  );

  if (eligibleBudgets.length === 0) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/proyectos/${projectId}/certificaciones`}>← Certificaciones</Link>
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">Nueva certificación</h1>
        </div>
        <div className="rounded-lg border bg-card px-6 py-8 text-center text-sm text-muted-foreground">
          <p>No hay presupuestos aprobados para este proyecto.</p>
          <p className="mt-1">Apruebe un presupuesto antes de crear una certificación.</p>
          <Button variant="outline" size="sm" className="mt-4" asChild>
            <Link href={`/proyectos/${projectId}/presupuestos`}>Ver presupuestos</Link>
          </Button>
        </div>
      </div>
    );
  }

  const budgetOptions = eligibleBudgets.map((b) => ({
    id: b.id,
    name: b.name,
    versionNumber: b.versionNumber,
    status: b.status,
  }));

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/proyectos/${projectId}/certificaciones`}>← Certificaciones</Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Nueva certificación</h1>
          <p className="text-sm text-muted-foreground">{project.name}</p>
        </div>
      </div>

      <div className="rounded-lg border bg-card p-6">
        <CertificationForm
          projectId={projectId}
          budgets={budgetOptions}
          defaultBudgetId={budgetOptions.length === 1 ? budgetOptions[0].id : undefined}
          onSubmit={(data) => createCertificationAction(projectId, data)}
        />
      </div>
    </div>
  );
}
