import { redirect } from "next/navigation";
import { PurchaseRequestForm } from "@/features/procurement/components/purchase-request-form";
import type { WbsOption } from "@/features/procurement";
import { getCurrentUser } from "@/lib/auth";
import { canEditPurchaseRequests, listProcurementWbsOptions } from "@bloqer/services";
import { PageShell } from "@/components/layout/page-shell";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function NuevaSolicitudCompraPage({ params }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");
  if (!canEditPurchaseRequests(current.tenantCtx.roles)) redirect("/dashboard");

  const { id } = await params;
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

  return (
    <PageShell variant="default" className="space-y-6">
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Nueva solicitud de compra</h1>
      </div>
      <PurchaseRequestForm projectId={id} wbsOptions={wbsOptions} />
    </PageShell>
  );
}
