import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { ListViewToggle } from "@/components/ui/list-view-toggle";
import { ListSectionSkeleton } from "@/components/ui/list-section-skeleton";
import { ProjectPageHeader } from "@/components/layout/project-page-header";
import { ReceivableListSection } from "@/features/sales-invoices";
import type { ReceivableListItem } from "@/features/sales-invoices";
import { getCurrentUser } from "@/lib/auth";
import { getProjectShellInfo, listReceivablesByProject, ServiceError } from "@bloqer/services";
import { PageShell } from "@/components/layout/page-shell";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CuentasPorCobrarPage({ params }: PageProps) {
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

  let receivables;
  try {
    receivables = await listReceivablesByProject(id, ctx);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  const items: ReceivableListItem[] = receivables.map((r) => ({
    id: r.id,
    projectId: r.projectId,
    salesInvoiceId: r.salesInvoiceId,
    dueDate: r.dueDate,
    status: r.status,
    originalAmount: r.originalAmount,
    paidAmount: r.paidAmount,
    balanceDue: r.balanceDue,
    currency: r.currency,
    clientName: r.clientName,
  }));

  return (
    <PageShell variant="default" className="space-y-6">
      <ProjectPageHeader
        projectId={id}
        projectName={project.name}
        title="Cuentas por cobrar"
        subtitle={`${items.length} ${items.length === 1 ? "cuenta" : "cuentas"}`}
        actions={
          <Suspense fallback={null}>
            <ListViewToggle storageKey={`cuentas-por-cobrar-${id}`} />
          </Suspense>
        }
      />

      <Suspense fallback={<ListSectionSkeleton />}>
        <ReceivableListSection receivables={items} projectId={id} />
      </Suspense>
    </PageShell>
  );
}
