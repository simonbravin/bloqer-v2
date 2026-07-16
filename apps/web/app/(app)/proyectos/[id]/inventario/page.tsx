import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { ListSectionSkeleton } from "@/components/ui/list-section-skeleton";
import { ProjectPageHeader } from "@/components/layout/project-page-header";
import { getCurrentUser } from "@/lib/auth";
import { getProjectShellInfo, listStockMovements, ServiceError } from "@bloqer/services";
import { StockMovementList } from "@/features/inventory";
import { PageShell } from "@/components/layout/page-shell";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ProyectoInventarioPage({ params }: PageProps) {
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
    movements = await listStockMovements({ projectId: id }, ctx);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  return (
    <PageShell variant="default" className="space-y-6">
      <ProjectPageHeader
        title="Inventario del proyecto"
        subtitle={`${movements.length} ${movements.length === 1 ? "movimiento" : "movimientos"}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href={`/proyectos/${id}/consumos`}>Ver consumos</Link>
            </Button>
            <Button asChild>
              <Link href={`/proyectos/${id}/consumos/nuevo`}>Registrar consumo</Link>
            </Button>
          </div>
        }
      />

      <Suspense fallback={<ListSectionSkeleton />}>
        <StockMovementList movements={movements} />
      </Suspense>
    </PageShell>
  );
}
