import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@bloqer/domain";
import {
  canEditPurchaseOrders,
  canEditPurchaseRequests,
  canViewProjectCostControlReport,
  getProjectProcurementHub,
  getProjectShellInfo,
  getTenantModuleGate,
  ServiceError,
} from "@bloqer/services";
import { PageShell } from "@/components/layout/page-shell";
import { ProjectPageHeader } from "@/components/layout/project-page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiStatCard } from "@/components/ui/kpi-stat-card";
import { KpiStatGrid } from "@/components/ui/kpi-stat-grid";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ProyectoComprasHubPage({ params }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id: projectId } = await params;
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

  let hub;
  try {
    hub = await getProjectProcurementHub(projectId, ctx);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "FORBIDDEN") redirect("/dashboard");
    throw err;
  }

  const canCreateSc = canEditPurchaseRequests(current.tenantCtx.roles);
  const canCreateOc = canEditPurchaseOrders(current.tenantCtx.roles);
  const gate = await getTenantModuleGate(ctx);
  const showMateriales =
    gate.isEnabled("PROJECTS") &&
    gate.isEnabled("BUDGETS") &&
    (canViewProjectCostControlReport(ctx.roles) || can(ctx.roles, "VIEW", "PROJECTS"));

  return (
    <PageShell variant="default" className="space-y-6">
      <ProjectPageHeader
        title="Tablero de compras"
        subtitle="Pendientes de solicitud, cotización, orden y recepción"
        actions={
          <div className="flex flex-wrap gap-2">
            {showMateriales ? (
              <Button asChild variant="outline">
                <Link href={`/proyectos/${projectId}/materiales`}>Materiales</Link>
              </Button>
            ) : null}
            {canCreateSc ? (
              <Button asChild variant="outline">
                <Link href={`${hub.links.solicitudes}?create=1`}>Nueva solicitud</Link>
              </Button>
            ) : null}
            {canCreateOc ? (
              <Button asChild>
                <Link href={`${hub.links.ordenes}?create=1`}>Nueva OC</Link>
              </Button>
            ) : null}
          </div>
        }
      />

      <KpiStatGrid title="Solicitudes" columns={4}>
        <KpiStatCard
          label="Borradores"
          value={String(hub.purchaseRequests.openDraft)}
          href={`${hub.links.solicitudes}?status=DRAFT`}
        />
        <KpiStatCard
          label="Enviadas"
          value={String(hub.purchaseRequests.submitted)}
          href={`${hub.links.solicitudes}?status=SUBMITTED`}
        />
        <KpiStatCard
          label="Esperando cotización"
          value={String(hub.purchaseRequests.awaitingQuotes)}
          href={`${hub.links.solicitudes}?status=SUBMITTED`}
        />
        <KpiStatCard
          label="Cotización elegida"
          value={String(hub.purchaseRequests.quoteSelected)}
          href={`${hub.links.solicitudes}?status=QUOTE_SELECTED`}
        />
      </KpiStatGrid>

      <KpiStatGrid title="Órdenes de compra" columns={4}>
        <KpiStatCard
          label="Por enviar"
          value={String(hub.purchaseOrders.draft)}
          href={`${hub.links.ordenes}?status=DRAFT`}
        />
        <KpiStatCard
          label="Por aprobar"
          value={String(hub.purchaseOrders.submitted)}
          href={`${hub.links.ordenes}?status=SUBMITTED`}
        />
        <KpiStatCard
          label="Por confirmar"
          value={String(hub.purchaseOrders.approved)}
          href={`${hub.links.ordenes}?status=APPROVED`}
        />
        <KpiStatCard
          label="Por recibir"
          value={String(hub.purchaseOrders.confirmedOpen + hub.purchaseOrders.partiallyReceived)}
          href={hub.links.recepciones}
        />
      </KpiStatGrid>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Accesos rápidos</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2 text-sm">
          <Button asChild variant="outline" size="sm">
            <Link href={hub.links.recepciones}>
              Recepciones (últimas 2 sem.: {hub.receipts.recentConfirmed})
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={hub.links.reporteCompras}>Reporte compras vs presupuesto</Link>
          </Button>
          {showMateriales ? (
            <Button asChild variant="outline" size="sm">
              <Link href={`/proyectos/${projectId}/materiales`}>Cobertura de materiales</Link>
            </Button>
          ) : null}
          <Button asChild variant="outline" size="sm">
            <Link href={hub.links.solicitudes}>Todas las solicitudes</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={hub.links.ordenes}>Todas las órdenes</Link>
          </Button>
        </CardContent>
      </Card>
    </PageShell>
  );
}
