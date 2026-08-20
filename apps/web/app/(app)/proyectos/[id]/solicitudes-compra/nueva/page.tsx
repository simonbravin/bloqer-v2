import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import {
  canEditPurchaseRequests,
  getProjectShellInfo,
  listProcurementWbsOptions,
  ServiceError,
} from "@bloqer/services";
import { PageShell } from "@/components/layout/page-shell";
import { ProjectPageHeader } from "@/components/layout/project-page-header";
import { PurchaseRequestCreateComposer } from "@/features/procurement/components/purchase-request-create-composer";
import type { WbsOption } from "@/features/procurement";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    wbsNodeId?: string;
    description?: string;
    quantity?: string;
    productId?: string;
    costAnalysisLineId?: string;
    unit?: string;
    from?: string;
  }>;
}

export default async function NuevaSolicitudCompraPage({ params, searchParams }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");
  if (!canEditPurchaseRequests(current.tenantCtx.roles)) redirect("/dashboard");

  const { id } = await params;
  const sp = await searchParams;
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

  const wbsNodes = await listProcurementWbsOptions(id, ctx);
  const wbsOptions: WbsOption[] = wbsNodes.map((n) => ({
    id: n.id,
    code: n.code,
    name: n.name,
    budgetName: n.budgetName,
    budgetUnitCost: n.budgetUnitCost,
    budgetUnit: n.budgetUnit,
    availableSaldo: n.availableSaldo,
    wouldExceedBudget: n.wouldExceedBudget,
    apuLines: n.apuLines,
  }));

  return (
    <PageShell variant="default" className="space-y-6" breadcrumbLabel="Nueva solicitud">
      <ProjectPageHeader
        title="Nueva solicitud de compra"
        subtitle="Pedido simple de una línea, con evidencia fotográfica."
      />
      <PurchaseRequestCreateComposer
        projectId={id}
        wbsOptions={wbsOptions}
        initialLine={{
          wbsNodeId: sp.wbsNodeId,
          description: sp.description,
          quantity: sp.quantity,
          productId: sp.productId,
          costAnalysisLineId: sp.costAnalysisLineId,
          unit: sp.unit,
        }}
        prefilledFromMaterials={sp.from === "materiales"}
      />
    </PageShell>
  );
}
