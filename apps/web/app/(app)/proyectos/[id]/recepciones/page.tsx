import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { ListViewToggle } from "@/components/ui/list-view-toggle";
import { ListSectionSkeleton } from "@/components/ui/list-section-skeleton";
import { ProjectPageHeader } from "@/components/layout/project-page-header";
import { PurchaseReceiptListSection } from "@/features/procurement";
import type { PurchaseReceiptListItem } from "@/features/procurement";
import { getCurrentUser } from "@/lib/auth";
import { getProjectShellInfo, listReceiptsByProject, ServiceError } from "@bloqer/services";
import { PageShell } from "@/components/layout/page-shell";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function RecepcionesPage({ params }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

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

  let receipts;
  try {
    receipts = await listReceiptsByProject(id, ctx);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  const items: PurchaseReceiptListItem[] = receipts.map((r) => ({
    id: r.id,
    purchaseOrderCode: r.purchaseOrderCode,
    supplierName: r.supplierName,
    receiptDate: r.receiptDate,
    status: r.status,
  }));

  return (
    <PageShell variant="default" className="space-y-6">
      <ProjectPageHeader
        title="Recepciones"
        subtitle={`${items.length} ${items.length === 1 ? "recepción" : "recepciones"}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Suspense fallback={null}>
              <ListViewToggle storageKey={`recepciones-${id}`} />
            </Suspense>
            <Button asChild variant="outline" size="sm">
              <Link href={`/proyectos/${id}/compras`}>Tablero de compras</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href={`/proyectos/${id}/ordenes-compra`}>Órdenes</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href={`/proyectos/${id}/materiales`}>Materiales</Link>
            </Button>
          </div>
        }
      />

      <Suspense fallback={<ListSectionSkeleton />}>
        <PurchaseReceiptListSection receipts={items} projectId={id} />
      </Suspense>
    </PageShell>
  );
}
