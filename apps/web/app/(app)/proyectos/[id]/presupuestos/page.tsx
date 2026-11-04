import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { ListViewToggle } from "@/components/ui/list-view-toggle";
import { ListSectionSkeleton } from "@/components/ui/list-section-skeleton";
import { ProjectPageHeader } from "@/components/layout/project-page-header";
import { BudgetListSection } from "@/features/budgets";
import { getCurrentUser } from "@/lib/auth";
import { serializeMoney } from "@bloqer/utils";
import { can } from "@bloqer/domain";
import { listBudgetsByProject, getProjectShellInfo, ServiceError } from "@bloqer/services";
import { PageShell } from "@/components/layout/page-shell";
import { budgetProjectReadOnlyReason } from "@/features/budgets/lib/budget-project-read-only";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function PresupuestosPage({ params }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id } = await params;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  let projectReadOnlyReason: string | null = null;
  try {
    const project = await getProjectShellInfo(id, ctx);
    projectReadOnlyReason = budgetProjectReadOnlyReason(project.status);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    if (err instanceof ServiceError && err.code === "FORBIDDEN") redirect("/dashboard");
    throw err;
  }

  let budgets: Awaited<ReturnType<typeof listBudgetsByProject>> = [];
  try {
    budgets = await listBudgetsByProject(id, ctx);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    if (err instanceof ServiceError && err.code === "FORBIDDEN") redirect("/dashboard");
    throw err;
  }

  const byId = new Map(budgets.map((b) => [b.id, b]));
  const canCreate = can(current.tenantCtx.roles, "EDIT", "BUDGETS") && !projectReadOnlyReason;

  const serialized = budgets.map((b) => {
    const parent = b.parentBudgetId ? byId.get(b.parentBudgetId) : undefined;
    return {
      id: b.id,
      projectId: b.projectId,
      versionNumber: b.versionNumber,
      name: b.name,
      status: b.status,
      currency: b.currency,
      totalCost: serializeMoney(b.totalCost.toString()),
      totalSalePrice: serializeMoney(b.totalSalePrice.toString()),
      parentBudgetId: b.parentBudgetId,
      parentVersionNumber: parent?.versionNumber ?? null,
      parentName: parent?.name ?? null,
    };
  });

  return (
    <PageShell variant="default" className="space-y-6">
      <ProjectPageHeader
        title="Presupuestos"
        subtitle={`${serialized.length} ${serialized.length === 1 ? "presupuesto" : "presupuestos"}`}
        actions={
          <>
            <Suspense fallback={null}>
              <ListViewToggle storageKey={`presupuestos-${id}`} />
            </Suspense>
            {canCreate && <Button asChild>
              <Link href={`/proyectos/${id}/presupuestos/nuevo`}>Nuevo presupuesto</Link>
            </Button>}
          </>
        }
      />

      {projectReadOnlyReason && <p role="status" className="rounded-lg border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">{projectReadOnlyReason}</p>}

      <Suspense fallback={<ListSectionSkeleton />}>
        <BudgetListSection budgets={serialized} projectId={id} canCreate={canCreate} />
      </Suspense>
    </PageShell>
  );
}
