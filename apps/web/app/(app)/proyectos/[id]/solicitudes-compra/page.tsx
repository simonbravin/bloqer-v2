import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { NewPurchaseRequestDialog } from "@/features/procurement";
import { PurchaseRequestListFilters } from "@/features/procurement/components/purchase-request-list-filters";
import type { WbsOption } from "@/features/procurement";
import { ProjectPageHeader } from "@/components/layout/project-page-header";
import { getCurrentUser } from "@/lib/auth";
import {
  canEditPurchaseRequests,
  getProjectShellInfo,
  listProcurementWbsOptions,
  listPurchaseRequestsByProject,
  ServiceError,
} from "@bloqer/services";
import { PageShell } from "@/components/layout/page-shell";

const PR_STATUS_FILTERS = [
  "DRAFT",
  "SUBMITTED",
  "QUOTE_SELECTED",
  "COMPLETED",
  "CANCELLED",
] as const;

type PrStatusFilter = (typeof PR_STATUS_FILTERS)[number];

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    status?: string;
    create?: string;
    wbsNodeId?: string;
    description?: string;
    quantity?: string;
    productId?: string;
    costAnalysisLineId?: string;
    unit?: string;
    from?: string;
  }>;
}

export default async function SolicitudesCompraPage({ params, searchParams }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id } = await params;
  const sp = await searchParams;
  const statusFilter = PR_STATUS_FILTERS.includes(sp.status as PrStatusFilter)
    ? (sp.status as PrStatusFilter)
    : undefined;

  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  try {
    await getProjectShellInfo(id, ctx);
  } catch (err) {
    if (err instanceof ServiceError && (err.code === "NOT_FOUND" || err.code === "FORBIDDEN")) notFound();
    if (err instanceof ServiceError && err.code === "FORBIDDEN") redirect("/dashboard");
    throw err;
  }

  let requests;
  try {
    requests = await listPurchaseRequestsByProject(id, ctx);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "FORBIDDEN") redirect("/dashboard");
    throw err;
  }

  const canCreate = canEditPurchaseRequests(current.tenantCtx.roles);

  let wbsOptions: WbsOption[] = [];
  if (canCreate) {
    const wbsNodes = await listProcurementWbsOptions(id, ctx);
    wbsOptions = wbsNodes.map((n) => ({
      id: n.id,
      code: n.code,
      name: n.name,
      budgetName: n.budgetName,
      budgetUnitCost: n.budgetUnitCost,
      budgetUnit: n.budgetUnit,
      availableSaldo: n.availableSaldo,
      wouldExceedBudget: n.wouldExceedBudget,
      apuLines: n.apuLines,
      dominantCostType: n.dominantCostType,
    }));
  }

  const createDialog = canCreate ? (
    <Suspense fallback={<Button disabled>Nueva solicitud</Button>}>
      <NewPurchaseRequestDialog
        projectId={id}
        wbsOptions={wbsOptions}
        defaultOpen={sp.create === "1"}
        initialLine={{
          wbsNodeId: sp.wbsNodeId,
          description: sp.description,
          quantity: sp.quantity,
          productId: sp.productId,
          costAnalysisLineId: sp.costAnalysisLineId,
          unit: sp.unit,
        }}
        prefilledFromMaterials={
          sp.from === "materiales" || sp.from === "mano-obra" || sp.from === "equipos"
        }
        prefillFrom={
          sp.from === "materiales" || sp.from === "mano-obra" || sp.from === "equipos"
            ? sp.from
            : undefined
        }
      />
    </Suspense>
  ) : null;

  const subtitle = `${requests.length} ${requests.length === 1 ? "solicitud" : "solicitudes"}`;

  return (
    <PageShell variant="default" className="space-y-6">
      <ProjectPageHeader
        title="Solicitudes de compra"
        subtitle={subtitle}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={`/proyectos/${id}/compras`}>Tablero de compras</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href={`/proyectos/${id}/materiales`}>Materiales</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href={`/proyectos/${id}/mano-obra`}>Mano de obra</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href={`/proyectos/${id}/equipos`}>Equipos</Link>
            </Button>
            {createDialog}
          </div>
        }
      />

      <PurchaseRequestListFilters
        requests={requests}
        projectId={id}
        initialStatus={statusFilter}
        canCreate={canCreate}
      />
    </PageShell>
  );
}
