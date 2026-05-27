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
import { getProjectShellInfo, listPurchaseOrdersByProject, ServiceError } from "@bloqer/services";
import { PageShell } from "@/components/layout/page-shell";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function OrdenesCompraPage({ params }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id } = await params;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  let project;
  try {
    project = await getProjectShellInfo(id, ctx);
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
    throw err;
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
  }));

  return (
    <PageShell variant="default" className="space-y-6">
      <ProjectPageHeader
        projectId={id}
        projectName={project.name}
        title="Órdenes de compra"
        subtitle={`${items.length} ${items.length === 1 ? "orden" : "órdenes"}`}
        actions={
          <>
            <Suspense fallback={null}>
              <ListViewToggle storageKey={`ordenes-compra-${id}`} />
            </Suspense>
            <Button asChild>
              <Link href={`/proyectos/${id}/ordenes-compra/nueva`}>Nueva OC</Link>
            </Button>
          </>
        }
      />

      <Suspense fallback={<ListSectionSkeleton />}>
        <PurchaseOrderListSection orders={items} projectId={id} />
      </Suspense>
    </PageShell>
  );
}
