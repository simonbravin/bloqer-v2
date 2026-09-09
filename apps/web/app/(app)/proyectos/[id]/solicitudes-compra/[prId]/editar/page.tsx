import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import {
  canEditPurchaseRequests,
  getPurchaseRequestById,
  getProjectShellInfo,
  listProcurementWbsOptions,
  ServiceError,
} from "@bloqer/services";
import { PageShell } from "@/components/layout/page-shell";
import { ProjectPageHeader } from "@/components/layout/project-page-header";
import { PurchaseRequestForm } from "@/features/procurement/components/purchase-request-form";
import { PROCUREMENT_FORM_PAGE_CLASS } from "@/features/procurement/lib/procurement-form-layout";
import { procurementAmberBannerClass } from "@/features/procurement/lib/procurement-ui";
import { toDateInput } from "@/lib/date-input";
import type { WbsOption } from "@/features/procurement";

interface PageProps {
  params: Promise<{ id: string; prId: string }>;
}

export default async function EditarSolicitudCompraPage({ params }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");
  if (!canEditPurchaseRequests(current.tenantCtx.roles)) redirect("/dashboard");

  const { id, prId } = await params;
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

  let pr;
  try {
    pr = await getPurchaseRequestById(prId, ctx);
  } catch (err) {
    if (err instanceof ServiceError && (err.code === "NOT_FOUND" || err.code === "FORBIDDEN")) {
      notFound();
    }
    throw err;
  }
  if (pr.projectId !== id) notFound();
  if (pr.status !== "DRAFT") {
    redirect(`/proyectos/${id}/solicitudes-compra/${prId}`);
  }

  const distinctWbsIds = [
    ...new Set(pr.lines.map((line) => line.wbsNodeId).filter((wbsId): wbsId is string => Boolean(wbsId))),
  ];
  if (distinctWbsIds.length > 1) {
    redirect(
      `/proyectos/${id}/solicitudes-compra/${prId}?actionError=${encodeURIComponent(
        "Esta solicitud tiene ítems en varias partidas EDT. Por ahora solo se puede editar desde escritorio creando una nueva solicitud.",
      )}`,
    );
  }

  let wbsOptions: WbsOption[] = [];
  try {
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
  } catch (err) {
    if (err instanceof ServiceError && err.code === "FORBIDDEN") redirect("/dashboard");
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  const primaryWbsId = pr.lines.find((l) => l.wbsNodeId)?.wbsNodeId ?? null;

  return (
    <PageShell variant="default" className="space-y-6" breadcrumbLabel={`Editar ${pr.code}`}>
      <ProjectPageHeader
        title={`Editar ${pr.code}`}
        subtitle="Corregí cantidades, ítems o la fecha requerida. Después volvé a enviar la solicitud."
      />
      {pr.returnReason ? (
        <p className={procurementAmberBannerClass}>
          Devuelta a borrador: {pr.returnReason}
        </p>
      ) : null}
      <div className={PROCUREMENT_FORM_PAGE_CLASS}>
        <PurchaseRequestForm
          mode="edit"
          purchaseRequestId={pr.id}
          projectId={id}
          wbsOptions={wbsOptions}
          variant="plain"
          initialValues={{
            neededByDate: toDateInput(pr.neededByDate) || null,
            notes: pr.notes,
            wbsNodeId: primaryWbsId,
            lines: pr.lines.map((line) => ({
              description: line.description,
              quantity: line.quantity,
              unit: line.unit,
              productId: line.productId,
              costAnalysisLineId: line.costAnalysisLineId,
              costType:
                line.costType === "MATERIAL" ||
                line.costType === "LABOR" ||
                line.costType === "EQUIPMENT" ||
                line.costType === "SUBCONTRACT" ||
                line.costType === "OTHER"
                  ? line.costType
                  : undefined,
            })),
          }}
        />
      </div>
    </PageShell>
  );
}
