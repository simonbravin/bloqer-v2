import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import type { ScheduleItemStatus } from "@bloqer/database";
import {
  getProjectScheduleWorkspace,
  getProjectShellInfo,
  ServiceError,
} from "@bloqer/services";
import { PageShell } from "@/components/layout/page-shell";
import { ProjectPageHeader } from "@/components/layout/project-page-header";
import { ScheduleWorkspace } from "@/features/schedule";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ budgetId?: string; delayedOnly?: string; status?: string }>;
}

export default async function ProyectoCronogramaPage({ params, searchParams }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id: projectId } = await params;
  const sp = await searchParams;

  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  try {
    await getProjectShellInfo(projectId, ctx);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    if (err instanceof ServiceError && err.code === "FORBIDDEN") redirect("/dashboard");
    throw err;
  }

  let result;
  try {
    const statusValues = [
      "PLANNED",
      "IN_PROGRESS",
      "BLOCKED",
      "COMPLETED",
      "CANCELLED",
    ] as const;
    const status = statusValues.includes(sp.status as ScheduleItemStatus)
      ? (sp.status as ScheduleItemStatus)
      : undefined;

    result = await getProjectScheduleWorkspace(
      projectId,
      {
        budgetId: sp.budgetId,
        delayedOnly: sp.delayedOnly === "1",
        status,
      },
      ctx,
    );
  } catch (err) {
    if (err instanceof ServiceError && err.code === "FORBIDDEN") redirect("/dashboard");
    throw err;
  }

  return (
    <PageShell variant="default" className="space-y-6">
      <ProjectPageHeader
        title="Cronograma"
        subtitle={
          result.type === "WORKSPACE"
            ? `Presupuesto base: ${result.budgetName}`
            : "Planificación temporal de la obra"
        }
      />

      {result.type === "NO_APPROVED_BUDGETS" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Sin presupuesto aprobado</CardTitle>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href={`/proyectos/${projectId}/presupuestos`}>Ir a Presupuesto</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {result.type === "BUDGET_SELECTION_REQUIRED" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Elegí presupuesto base</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {result.availableBudgets.map((b) => (
              <Button key={b.id} variant="outline" asChild>
                <Link href={`/proyectos/${projectId}/cronograma?budgetId=${b.id}`}>
                  {b.name} ({b.status})
                </Link>
              </Button>
            ))}
          </CardContent>
        </Card>
      )}

      {result.type === "WORKSPACE" && (
        <ScheduleWorkspace projectId={projectId} workspace={result} />
      )}
    </PageShell>
  );
}
