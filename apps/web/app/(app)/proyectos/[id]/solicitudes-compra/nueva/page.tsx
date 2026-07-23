import Link from "next/link";
import { redirect } from "next/navigation";
import { PurchaseRequestForm } from "@/features/procurement/components/purchase-request-form";
import type { WbsOption } from "@/features/procurement";
import { getCurrentUser } from "@/lib/auth";
import { canEditPurchaseRequests, listProcurementWbsOptions } from "@bloqer/services";
import { PageShell } from "@/components/layout/page-shell";
import { ProjectPageHeader } from "@/components/layout/project-page-header";
import { Button } from "@/components/ui/button";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    wbsNodeId?: string;
    description?: string;
    quantity?: string;
    productId?: string;
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
  }));

  const fromMaterials = sp.from === "materiales";

  return (
    <PageShell variant="default" className="space-y-6">
      <ProjectPageHeader
        title="Nueva solicitud de compra"
        subtitle={
          fromMaterials
            ? "Prefill desde cobertura de materiales"
            : "Pedido de materiales u otros insumos del proyecto"
        }
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href={fromMaterials ? `/proyectos/${id}/materiales` : `/proyectos/${id}/solicitudes-compra`}>
              Volver
            </Link>
          </Button>
        }
      />
      <PurchaseRequestForm
        projectId={id}
        wbsOptions={wbsOptions}
        prefilledFromMaterials={fromMaterials}
        initialLine={{
          wbsNodeId: sp.wbsNodeId,
          description: sp.description,
          quantity: sp.quantity,
          productId: sp.productId,
        }}
      />
    </PageShell>
  );
}
