import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { ListViewToggle } from "@/components/ui/list-view-toggle";
import { ListSectionSkeleton } from "@/components/ui/list-section-skeleton";
import { ProjectPageHeader } from "@/components/layout/project-page-header";
import { BudgetListSection } from "@/features/budgets";
import { getCurrentUser } from "@/lib/auth";
import { listBudgetsByProject, getProjectShellInfo, ServiceError } from "@bloqer/services";
import { PageShell } from "@/components/layout/page-shell";

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

  try {
    await getProjectShellInfo(id, ctx);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    if (err instanceof ServiceError && err.code === "FORBIDDEN") redirect("/dashboard");
    throw err;
  }

  const budgets = await listBudgetsByProject(id, ctx);

  const serialized = budgets.map((b) => ({
    id: b.id,
    projectId: b.projectId,
    versionNumber: b.versionNumber,
    name: b.name,
    status: b.status,
    currency: b.currency,
    totalCost: b.totalCost.toString(),
    totalSalePrice: b.totalSalePrice.toString(),
  }));

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
            <Button asChild>
              <Link href={`/proyectos/${id}/presupuestos/nuevo`}>Nuevo presupuesto</Link>
            </Button>
          </>
        }
      />

      <div className="rounded-lg border border-dashed bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
        Podés crear más de un presupuesto por proyecto (p. ej. como adenda operativa). En esta
        versión no hay vínculo automático padre–hijo ni estado <span className="font-mono">SUPERSEDED</span>.
        Solo puede haber un presupuesto <span className="font-mono">APPROVED</span> a la vez.
      </div>

      <Suspense fallback={<ListSectionSkeleton />}>
        <BudgetListSection budgets={serialized} projectId={id} />
      </Suspense>
    </PageShell>
  );
}
