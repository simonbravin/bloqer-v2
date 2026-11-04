import { notFound, redirect } from "next/navigation";
import { PurchaseOrderEditForm } from "@/features/procurement";
import type { SupplierOption, WbsOption, ProductOption } from "@/features/procurement";
import { getCurrentUser } from "@/lib/auth";
import { PageShell } from "@/components/layout/page-shell";
import { toContactPickerOption } from "@/lib/searchable-options";
import {
  getPurchaseOrderById,
  getCompanyProcurementSettingsForProject,
  listProcurementWbsOptions,
  listAllContacts,
  listProducts,
  ServiceError,
} from "@bloqer/services";

interface PageProps {
  params: Promise<{ id: string; poId: string }>;
}

export default async function EditarOrdenCompraPage({ params }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id, poId } = await params;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  let order;
  try {
    order = await getPurchaseOrderById(poId, ctx);
  } catch (err) {
    if (err instanceof ServiceError && (err.code === "NOT_FOUND" || err.code === "FORBIDDEN")) notFound();
    throw err;
  }

  if (order.projectId !== id) notFound();

  if (order.status !== "DRAFT") {
    redirect(`/proyectos/${id}/ordenes-compra/${poId}`);
  }

  const orderCtx = { ...ctx, companyId: order.companyId };
  const [suppliersResult, wbsNodes, productsResult, settings] = await Promise.all([
    listAllContacts({ role: "SUPPLIER", status: "ACTIVE" }, orderCtx),
    listProcurementWbsOptions(id, orderCtx),
    listProducts({ status: "ACTIVE" }, orderCtx),
    getCompanyProcurementSettingsForProject(id, orderCtx),
  ]);
  const products = productsResult.data.filter((product) => product.companyId == null || product.companyId === order.companyId);

  const suppliers: SupplierOption[] = suppliersResult.map(toContactPickerOption);

  const wbsOptions: WbsOption[] = wbsNodes.map((n) => ({
    id: n.id,
    code: n.code,
    name: n.name,
    budgetName: n.budgetName,
    budgetUnitCost: n.budgetUnitCost,
    budgetCurrency: n.budgetCurrency,
    budgetWarning: n.budgetWarning,
    budgetUnit: n.budgetUnit,
    availableSaldo: n.availableSaldo,
    wouldExceedBudget: n.wouldExceedBudget,
    apuLines: n.apuLines,
    dominantCostType: n.dominantCostType,
  }));

  const productOptions: ProductOption[] = products.map((p) => ({
    id: p.id,
    sku: p.sku,
    name: p.name,
    unit: p.unit,
  }));

  const allowEmergency = settings.allowEmergencyDirectPo &&
    current.tenantCtx.roles.some((r) => r === "OWNER" || r === "ADMIN");
  const varianceSettings = {
    varianceSoftAlertPct: settings.varianceSoftAlertPct,
    varianceExtraApprovalPct: settings.varianceExtraApprovalPct,
  };

  return (
    <PageShell variant="default" className="space-y-6" breadcrumbLabel={order.code}>
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Editar {order.code}</h1>
      </div>

      <PurchaseOrderEditForm
        projectId={id}
        order={order}
        suppliers={suppliers}
        wbsOptions={wbsOptions}
        productOptions={productOptions}
        allowEmergencyDirectPo={allowEmergency}
        varianceSettings={varianceSettings}
      />
    </PageShell>
  );
}
