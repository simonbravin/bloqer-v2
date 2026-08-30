import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import type { ScheduleItemStatus } from "@bloqer/database";
import {
  getProjectScheduleFieldWorkspace,
  getProjectScheduleWorkspace,
  getProjectShellInfo,
  parseScheduleFieldFilter,
  ServiceError,
} from "@bloqer/services";
import { PageShell } from "@/components/layout/page-shell";
import { ProjectPageHeader } from "@/components/layout/project-page-header";
import { ScheduleWorkspace } from "@/features/schedule";
import { ScheduleFieldExperience } from "@/features/schedule/components/schedule-field-experience";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { isScheduleFieldViewport, parseViewportHint, VIEWPORT_COOKIE } from "@/lib/viewport-hint-cookie";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    budgetId?: string;
    delayedOnly?: string;
    status?: string;
    type?: string;
    field?: string;
  }>;
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
    if (err instanceof ServiceError && (err.code === "NOT_FOUND" || err.code === "FORBIDDEN")) notFound();
    throw err;
  }

  const hint = parseViewportHint((await cookies()).get(VIEWPORT_COOKIE)?.value);
  const loadField = isScheduleFieldViewport(hint);

  if (loadField) {
    const started = Date.now();
    let field;
    try {
      field = await getProjectScheduleFieldWorkspace(projectId, ctx);
    } catch (err) {
      if (err instanceof ServiceError && err.code === "FORBIDDEN") redirect("/dashboard");
      throw err;
    }
    const queryMs = Date.now() - started;
    return (
      <PageShell variant="default" className="space-y-6">
        <ProjectPageHeader title="Cronograma" subtitle="Tareas de la obra" />
        <ScheduleFieldExperience projectId={projectId} workspace={field} queryMs={queryMs} />
      </PageShell>
    );
  }

  let result;
  const started = Date.now();
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
    const itemType =
      sp.type === "TASK" || sp.type === "MILESTONE" ? sp.type : undefined;
    const fieldFilter = parseScheduleFieldFilter(sp.field);

    result = await getProjectScheduleWorkspace(
      projectId,
      {
        budgetId: sp.budgetId,
        delayedOnly: fieldFilter ? false : sp.delayedOnly === "1",
        status: fieldFilter ? undefined : status,
        itemType: fieldFilter ? undefined : itemType,
      },
      ctx,
    );
  } catch (err) {
    if (err instanceof ServiceError && err.code === "FORBIDDEN") redirect("/dashboard");
    throw err;
  }
  const queryMs = Date.now() - started;

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
        <ScheduleWorkspace projectId={projectId} workspace={result} queryMs={queryMs} />
      )}
    </PageShell>
  );
}
