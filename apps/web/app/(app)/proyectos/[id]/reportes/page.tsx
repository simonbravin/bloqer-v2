import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import {
  getProjectShellInfo,
  getTenantModuleGate,
  ServiceError,
  canViewArProjectArea,
  canViewApProjectArea,
  canManageScheduledReports,
  canViewProjectCostControlReport,
  canViewProjectCashFlowReport,
  canViewProcurementProjectArea,
  canViewSubcontractsArea,
} from "@bloqer/services";
import { can } from "@bloqer/domain";
import { ReportsHub } from "@/features/reports";
import { PageShell } from "@/components/layout/page-shell";
import { ProjectPageHeader } from "@/components/layout/project-page-header";
import { Button } from "@/components/ui/button";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ProjectReportesPage({ params }: PageProps) {
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

  const gate = await getTenantModuleGate(ctx);
  const canCost =
    gate.isEnabled("PROJECTS") &&
    gate.isEnabled("BUDGETS") &&
    canViewProjectCostControlReport(ctx.roles);
  const canAr = gate.isEnabled("AR") && canViewArProjectArea(ctx.roles);
  const canAp = gate.isEnabled("AP") && canViewApProjectArea(ctx.roles);
  const canCert =
    gate.isEnabled("PROJECTS") &&
    gate.isEnabled("BUDGETS") &&
    gate.isEnabled("CERTIFICATIONS") &&
    (can(ctx.roles, "VIEW", "CERTIFICATIONS") || can(ctx.roles, "VIEW", "PROJECTS"));
  const canCash = gate.isEnabled("PROJECTS") && canViewProjectCashFlowReport(ctx.roles);
  const canProcurement =
    gate.isEnabled("PROJECTS") &&
    gate.isEnabled("BUDGETS") &&
    gate.isEnabled("PROCUREMENT") &&
    (canViewProcurementProjectArea(ctx.roles) || can(ctx.roles, "VIEW", "PROJECTS"));
  const canSubcontracts =
    gate.isEnabled("PROJECTS") &&
    gate.isEnabled("BUDGETS") &&
    gate.isEnabled("SUBCONTRACTS") &&
    (canViewSubcontractsArea(ctx.roles) || can(ctx.roles, "VIEW", "PROJECTS"));

  const canProfitability = canCost;
  const canInventory =
    gate.isEnabled("PROJECTS") &&
    gate.isEnabled("BUDGETS") &&
    gate.isEnabled("INVENTORY") &&
    canCost;
  const hasAnyReport =
    canAr ||
    canAp ||
    canCost ||
    canCert ||
    canCash ||
    canProcurement ||
    canSubcontracts ||
    canProfitability ||
    canInventory;

  return (
    <PageShell variant="default" className="space-y-6">
      <ProjectPageHeader title="Reportes del proyecto" />

      {!hasAnyReport ? (
        <div className="rounded-lg border bg-card p-8 text-center space-y-3">
          <p className="font-semibold">Sin reportes disponibles</p>
          <p className="text-sm text-muted-foreground">
            Activá presupuestos o revisá tus permisos.
          </p>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/proyectos/${projectId}`}>Volver al resumen</Link>
          </Button>
        </div>
      ) : (
        <>
          {canManageScheduledReports(ctx) ? (
            <div className="flex justify-end">
              <Button variant="outline" size="sm" asChild>
                <Link href={`/proyectos/${projectId}/reportes/programados`}>
                  Envíos programados por email
                </Link>
              </Button>
            </div>
          ) : null}
          <ReportsHub
            projectId={projectId}
            canAr={canAr}
            canAp={canAp}
            canCostReports={canCost}
            canCertReports={canCert}
            canProcurementReports={canProcurement}
            canSubcontractReports={canSubcontracts}
            canCashFlow={canCash}
            canProfitability={canProfitability}
            canInventoryReports={canInventory}
          />
        </>
      )}
    </PageShell>
  );
}
