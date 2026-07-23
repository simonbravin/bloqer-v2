import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { ListSectionSkeleton } from "@/components/ui/list-section-skeleton";
import { PageShell } from "@/components/layout/page-shell";
import { ProjectPageHeader } from "@/components/layout/project-page-header";
import { getCurrentUser } from "@/lib/auth";
import {
  NewStockConsumptionDialog,
  StockMovementList,
  type ProductOption,
  type WarehouseOption,
  type WbsOption,
} from "@/features/inventory";
import { can } from "@bloqer/domain";
import {
  canViewProcurementProjectArea,
  canViewProjectCostControlReport,
  canViewPurchaseRequests,
  getProjectShellInfo,
  getTenantModuleGate,
  listInventoryConsumptionWbsOptions,
  listProducts,
  listStockMovements,
  listWarehouses,
  ServiceError,
} from "@bloqer/services";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ create?: string }>;
}

export default async function ProyectoConsumosPage({ params, searchParams }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

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
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    if (err instanceof ServiceError && err.code === "FORBIDDEN") redirect("/dashboard");
    throw err;
  }

  let movements;
  try {
    movements = await listStockMovements(
      { projectId: id, sourceType: "CONSUMPTION", status: "CONFIRMED" },
      ctx,
    );
  } catch (err) {
    if (err instanceof ServiceError && err.code === "FORBIDDEN") redirect("/dashboard");
    throw err;
  }
  const canCreateConsumption = can(current.tenantCtx.roles, "EDIT", "INVENTORY");
  const gate = await getTenantModuleGate(ctx);
  const showMateriales =
    gate.isEnabled("PROJECTS") &&
    gate.isEnabled("BUDGETS") &&
    (canViewProjectCostControlReport(ctx.roles) || can(ctx.roles, "VIEW", "PROJECTS"));
  const showCompras =
    gate.isEnabled("PROCUREMENT") &&
    (canViewProcurementProjectArea(ctx.roles) || canViewPurchaseRequests(ctx.roles));

  let products: ProductOption[] = [];
  let warehouses: WarehouseOption[] = [];
  let wbsOptions: WbsOption[] = [];
  let createOptionsReady = false;

  if (canCreateConsumption) {
    try {
      const [productsResult, warehouseRows, wbsNodes] = await Promise.all([
        listProducts({ status: "ACTIVE" }, ctx),
        listWarehouses({ status: "ACTIVE" }, ctx),
        listInventoryConsumptionWbsOptions(id, ctx),
      ]);
      products = productsResult.data.map((p) => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        unit: p.unit,
      }));
      warehouses = warehouseRows.map((w) => ({
        id: w.id,
        name: w.name,
      }));
      wbsOptions = wbsNodes.map((w) => ({
        id: w.id,
        code: w.code,
        name: w.name,
      }));
      createOptionsReady = true;
    } catch (err) {
      // Keep the list usable; hide create CTA if catalogs cannot be loaded.
      if (err instanceof ServiceError && err.code === "FORBIDDEN") {
        createOptionsReady = false;
      } else if (err instanceof ServiceError && err.code === "NOT_FOUND") {
        createOptionsReady = false;
      } else {
        throw err;
      }
    }
  }

  const showCreate = canCreateConsumption && createOptionsReady;

  const createDialog = showCreate ? (
    <Suspense fallback={<Button disabled>Registrar consumo</Button>}>
      <NewStockConsumptionDialog
        projectId={id}
        products={products}
        warehouses={warehouses}
        wbsOptions={wbsOptions}
        defaultOpen={sp.create === "1"}
      />
    </Suspense>
  ) : null;

  return (
    <PageShell variant="default" className="space-y-6">
      <ProjectPageHeader
        title="Consumos del proyecto"
        subtitle={`${movements.length} ${movements.length === 1 ? "consumo confirmado" : "consumos confirmados"}`}
        actions={
          <div className="flex flex-wrap gap-2">
            {showMateriales ? (
              <Button asChild variant="outline">
                <Link href={`/proyectos/${id}/materiales`}>Materiales</Link>
              </Button>
            ) : null}
            {showCompras ? (
              <Button asChild variant="outline">
                <Link href={`/proyectos/${id}/compras`}>Tablero de compras</Link>
              </Button>
            ) : null}
            {createDialog}
          </div>
        }
      />

      <Suspense fallback={<ListSectionSkeleton />}>
        <StockMovementList
          movements={movements}
          emptyTitle="Sin consumos registrados"
          emptyDescription="Todavía no hay consumos confirmados."
          emptyAction={
            showCreate ? (
              <Button asChild size="sm">
                <Link href={`/proyectos/${id}/consumos?create=1`}>Registrar consumo</Link>
              </Button>
            ) : undefined
          }
        />
      </Suspense>
    </PageShell>
  );
}
