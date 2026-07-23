import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { ListViewToggle } from "@/components/ui/list-view-toggle";
import { ListSectionSkeleton } from "@/components/ui/list-section-skeleton";
import { ProjectPageHeader } from "@/components/layout/project-page-header";
import { PurchaseOrderListSection } from "@/features/procurement/components/purchase-order-list-section";
import type { PurchaseOrderListItem } from "@/features/procurement";
import { getCurrentUser } from "@/lib/auth";
import {
  canEditPurchaseOrders,
  getProjectShellInfo,
  listPurchaseOrdersByProject,
  ServiceError,
} from "@bloqer/services";
import { PageShell } from "@/components/layout/page-shell";

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

const STATUS_LABELS: Record<PoStatusFilter, string> = {
  DRAFT: "borrador (por enviar)",
  SUBMITTED: "enviadas (por aprobar)",
  APPROVED: "aprobadas (por confirmar)",
  CONFIRMED: "confirmadas",
  PARTIALLY_RECEIVED: "parcialmente recibidas",
  RECEIVED: "recibidas",
  CANCELLED: "canceladas",
};

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ status?: string; view?: string }>;
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
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    if (err instanceof ServiceError && err.code === "FORBIDDEN") redirect("/dashboard");
    throw err;
  }

  let orders;
  try {
    orders = await listPurchaseOrdersByProject(id, ctx);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    if (err instanceof ServiceError && err.code === "FORBIDDEN") redirect("/dashboard");
    throw err;
  }

  const canCreatePo = canEditPurchaseOrders(current.tenantCtx.roles);

  const items: PurchaseOrderListItem[] = orders.map((o) => ({
    id: o.id,
    code: o.code,
    supplierName: o.supplierName,
    issueDate: o.issueDate,
    expectedDeliveryDate: o.expectedDeliveryDate,
    totalAmount: o.totalAmount,
    currency: o.currency,
    status: o.status,
  }));

  const filtered = statusFilter ? items.filter((o) => o.status === statusFilter) : items;
  const listHref = `/proyectos/${id}/ordenes-compra`;

  const subtitle = statusFilter
    ? `${filtered.length} ${STATUS_LABELS[statusFilter]}`
    : `${items.length} ${items.length === 1 ? "orden" : "órdenes"}`;

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
              <Button asChild>
                <Link href={`/proyectos/${id}/ordenes-compra/nueva`}>Nueva OC</Link>
              </Button>
            ) : null}
          </div>
        }
      />

      {statusFilter ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 px-4 py-3 text-sm">
          <span>Filtro activo: {STATUS_LABELS[statusFilter]}.</span>
          <Button asChild variant="link" size="sm" className="h-auto p-0">
            <Link href={listHref}>Ver todas</Link>
          </Button>
        </div>
      ) : null}

      <Suspense fallback={<ListSectionSkeleton />}>
        <PurchaseOrderListSection orders={filtered} projectId={id} />
      </Suspense>
    </PageShell>
  );
}
