import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { ListSectionSkeleton } from "@/components/ui/list-section-skeleton";
import { PageShell } from "@/components/layout/page-shell";
import { ProjectPageHeader } from "@/components/layout/project-page-header";
import { getCurrentUser } from "@/lib/auth";
import { StockMovementList } from "@/features/inventory";
import { can } from "@bloqer/domain";
import {
  canViewProcurementProjectArea,
  canViewProjectCostControlReport,
  canViewPurchaseRequests,
  getProjectShellInfo,
  getTenantModuleGate,
  listStockMovements,
  ServiceError,
} from "@bloqer/services";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ProyectoConsumosPage({ params }: PageProps) {
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

  let movements;
  try {
    movements = await listStockMovements(
      { projectId: id, sourceType: "CONSUMPTION", status: "CONFIRMED" },
      ctx,
    );
  } catch (err) {
    if (err instanceof ServiceError && err.code === "FORBIDDEN") redirect("/dashboard");
    throw err;
  }
  const canCreateConsumption = can(current.tenantCtx.roles, "EDIT", "INVENTORY");
  const gate = await getTenantModuleGate(ctx);
  const showMateriales =
    gate.isEnabled("PROJECTS") &&
    gate.isEnabled("BUDGETS") &&
    (canViewProjectCostControlReport(ctx.roles) || can(ctx.roles, "VIEW", "PROJECTS"));
  const showCompras =
    gate.isEnabled("PROCUREMENT") &&
    (canViewProcurementProjectArea(ctx.roles) || canViewPurchaseRequests(ctx.roles));

  return (
    <PageShell variant="default" className="space-y-6">
      <ProjectPageHeader
        title="Consumos del proyecto"
        subtitle={`${movements.length} ${movements.length === 1 ? "consumo confirmado" : "consumos confirmados"}`}
        actions={
          <div className="flex flex-wrap gap-2">
            {showMateriales ? (
              <Button asChild variant="outline">
                <Link href={`/proyectos/${id}/materiales`}>Materiales</Link>
              </Button>
            ) : null}
            {showCompras ? (
              <Button asChild variant="outline">
                <Link href={`/proyectos/${id}/compras`}>Tablero de compras</Link>
              </Button>
            ) : null}
            {canCreateConsumption ? (
              <Button asChild>
                <Link href={`/proyectos/${id}/consumos/nuevo`}>Registrar consumo</Link>
              </Button>
            ) : null}
          </div>
        }
      />

      <Suspense fallback={<ListSectionSkeleton />}>
        <StockMovementList
          movements={movements}
          emptyTitle="Sin consumos registrados"
          emptyDescription="Todavía no hay consumos confirmados."
          emptyAction={
            canCreateConsumption ? (
              <Button asChild size="sm">
                <Link href={`/proyectos/${id}/consumos/nuevo`}>Registrar consumo</Link>
              </Button>
            ) : undefined
          }
        />
      </Suspense>
    </PageShell>
  );
}
