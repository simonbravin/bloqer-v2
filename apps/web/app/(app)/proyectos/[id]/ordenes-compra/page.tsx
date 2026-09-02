import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { ListViewToggle } from "@/components/ui/list-view-toggle";
import { ListSectionSkeleton } from "@/components/ui/list-section-skeleton";
import { ProjectPageHeader } from "@/components/layout/project-page-header";
import { PurchaseOrderListFilters } from "@/features/procurement/components/purchase-order-list-filters";
import {
  NewPurchaseOrderDialog,
  type PurchaseOrderListItem,
  type ProductOption,
  type SupplierOption,
  type WbsOption,
} from "@/features/procurement";
import { getCurrentUser } from "@/lib/auth";
import {
  canEditPurchaseOrders,
  getCompanyProcurementSettingsForProject,
  getProjectShellInfo,
  listAllContacts,
  listProcurementWbsOptions,
  listProducts,
  listPurchaseOrdersByProject,
  ServiceError,
} from "@bloqer/services";
import { PageShell } from "@/components/layout/page-shell";
import { toContactPickerOption } from "@/lib/searchable-options";

const PO_STATUS_FILTERS = [
  "DRAFT",
  "SUBMITTED",
  "APPROVED",
  "CONFIRMED",
  "PARTIALLY_RECEIVED",
  "RECEIVED",
  "CANCELLED",
] as const;

type PoStatusFilter = (typeof PO_STATUS_FILTERS)[number];

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ status?: string; view?: string; create?: string }>;
}

export default async function OrdenesCompraPage({ params, searchParams }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id } = await params;
  const sp = await searchParams;
  const statusFilter = PO_STATUS_FILTERS.includes(sp.status as PoStatusFilter)
    ? (sp.status as PoStatusFilter)
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

  let orders;
  try {
    orders = await listPurchaseOrdersByProject(id, ctx);
  } catch (err) {
    if (err instanceof ServiceError && (err.code === "NOT_FOUND" || err.code === "FORBIDDEN")) notFound();
    if (err instanceof ServiceError && err.code === "FORBIDDEN") redirect("/dashboard");
    throw err;
  }

  const canCreatePo = canEditPurchaseOrders(current.tenantCtx.roles);

  let suppliers: SupplierOption[] = [];
  let wbsOptions: WbsOption[] = [];
  let productOptions: ProductOption[] = [];
  let allowEmergency = false;
  let varianceSettings: { varianceSoftAlertPct: string; varianceExtraApprovalPct: string } | undefined;

  if (canCreatePo) {
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
  }

  const items: PurchaseOrderListItem[] = orders.map((o) => ({
    id: o.id,
    code: o.code,
    supplierName: o.supplierName,
    issueDate: o.issueDate,
    expectedDeliveryDate: o.expectedDeliveryDate,
    totalAmount: o.totalAmount,
    currency: o.currency,
    status: o.status,
    approvedByName: o.approvedByName,
  }));

  const subtitle = `${items.length} ${items.length === 1 ? "orden" : "órdenes"}`;

  return (
    <PageShell variant="default" className="space-y-6">
      <ProjectPageHeader
        title="Órdenes de compra"
        subtitle={subtitle}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Suspense fallback={null}>
              <ListViewToggle storageKey={`ordenes-compra-${id}`} />
            </Suspense>
            <Button asChild variant="outline" size="sm">
              <Link href={`/proyectos/${id}/compras`}>Tablero de compras</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href={`/proyectos/${id}/solicitudes-compra`}>Solicitudes</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href={`/proyectos/${id}/recepciones`}>Recepciones</Link>
            </Button>
            {canCreatePo ? (
              <Suspense fallback={<Button disabled>Nueva OC</Button>}>
                <NewPurchaseOrderDialog
                  projectId={id}
                  suppliers={suppliers}
                  wbsOptions={wbsOptions}
                  productOptions={productOptions}
                  allowEmergencyDirectPo={allowEmergency}
                  varianceSettings={varianceSettings}
                  defaultOpen={sp.create === "1"}
                />
              </Suspense>
            ) : null}
          </div>
        }
      />

      <Suspense fallback={<ListSectionSkeleton />}>
        <PurchaseOrderListFilters
          orders={items}
          projectId={id}
          initialStatus={statusFilter}
        />
      </Suspense>
    </PageShell>
  );
}
