import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import {
  canEditPurchaseOrders,
  getCompanyProcurementSettingsForProject,
  getProjectShellInfo,
  listAllContacts,
  listProcurementWbsOptions,
  listProducts,
  ServiceError,
} from "@bloqer/services";
import { PageShell } from "@/components/layout/page-shell";
import { ProjectPageHeader } from "@/components/layout/project-page-header";
import { PurchaseOrderForm, type ProductOption, type SupplierOption, type WbsOption } from "@/features/procurement";
import { PROCUREMENT_FORM_PAGE_CLASS } from "@/features/procurement/lib/procurement-form-layout";
import { toContactPickerOption } from "@/lib/searchable-options";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function NuevaOrdenCompraPage({ params }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");
  if (!canEditPurchaseOrders(current.tenantCtx.roles)) redirect("/dashboard");

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

  let suppliers: SupplierOption[] = [];
  let wbsOptions: WbsOption[] = [];
  let productOptions: ProductOption[] = [];
  try {
    const [suppliersResult, wbsNodes, productsResult] = await Promise.all([
      listAllContacts({ role: "SUPPLIER", status: "ACTIVE" }, ctx),
      listProcurementWbsOptions(id, ctx),
      listProducts({ status: "ACTIVE" }, ctx),
    ]);
    suppliers = suppliersResult.map(toContactPickerOption);
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
    productOptions = productsResult.data.map((p) => ({
      id: p.id,
      sku: p.sku,
      name: p.name,
      unit: p.unit,
    }));
  } catch (err) {
    if (err instanceof ServiceError && err.code === "FORBIDDEN") redirect("/dashboard");
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  let allowEmergency = false;
  let varianceSettings: { varianceSoftAlertPct: string; varianceExtraApprovalPct: string } | undefined;
  try {
    const settings = await getCompanyProcurementSettingsForProject(id, ctx);
    allowEmergency =
      settings.allowEmergencyDirectPo &&
      current.tenantCtx.roles.some((r) => r === "OWNER" || r === "ADMIN");
    varianceSettings = {
      varianceSoftAlertPct: settings.varianceSoftAlertPct,
      varianceExtraApprovalPct: settings.varianceExtraApprovalPct,
    };
  } catch {
    allowEmergency = false;
  }

  return (
    <PageShell variant="default" className="space-y-6" breadcrumbLabel="Nueva OC">
      <ProjectPageHeader
        title="Nueva orden de compra"
        subtitle="Proveedor, líneas y fechas de la orden."
      />
      <div className={PROCUREMENT_FORM_PAGE_CLASS}>
        <PurchaseOrderForm
          projectId={id}
          suppliers={suppliers}
          wbsOptions={wbsOptions}
          productOptions={productOptions}
          allowEmergencyDirectPo={allowEmergency}
          varianceSettings={varianceSettings}
          variant="plain"
        />
      </div>
    </PageShell>
  );
}
