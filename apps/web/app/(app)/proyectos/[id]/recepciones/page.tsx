import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { ListSectionSkeleton } from "@/components/ui/list-section-skeleton";
import { ProjectPageHeader } from "@/components/layout/project-page-header";
import { PurchaseReceiptList } from "@/features/procurement";
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

  let project;
  try {
    project = await getProjectShellInfo(id, ctx);
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
        projectId={id}
        projectName={project.name}
        title="Recepciones"
        subtitle={`${items.length} ${items.length === 1 ? "recepción" : "recepciones"}`}
      />

      <Suspense fallback={<ListSectionSkeleton />}>
        <div className="rounded-lg border bg-card">
          <div className="border-b px-6 py-4">
            <h2 className="font-semibold">Recepciones del proyecto</h2>
          </div>
          <div className="p-6">
            <PurchaseReceiptList receipts={items} projectId={id} />
          </div>
        </div>
      </Suspense>
    </PageShell>
  );
}
