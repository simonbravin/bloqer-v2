import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { Pagination } from "@/components/ui/pagination";
import { ListViewToggle } from "@/components/ui/list-view-toggle";
import { ListSectionSkeleton } from "@/components/ui/list-section-skeleton";
import { ProjectPageHeader } from "@/components/layout/project-page-header";
import { PayableListSection } from "@/features/ap";
import type { PayableListItem } from "@/features/ap";
import { getCurrentUser } from "@/lib/auth";
import { getProjectShellInfo, listPayablesByProject, ServiceError } from "@bloqer/services";
import { PageShell } from "@/components/layout/page-shell";

const PAGE_SIZE = 20;

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}

export default async function CuentasPorPagarPage({ params, searchParams }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id } = await params;
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1));
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

  let payablesResult;
  try {
    payablesResult = await listPayablesByProject(id, ctx, { page, pageSize: PAGE_SIZE });
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  const payables = payablesResult.data;
  const payablesTotal = payablesResult.total;

  const items: PayableListItem[] = payables.map((p) => ({
    id: p.id,
    supplierName: p.supplierName,
    dueDate: p.dueDate,
    status: p.status,
    originalAmount: p.originalAmount,
    paidAmount: p.paidAmount,
    balanceDue: p.balanceDue,
    currency: p.currency,
  }));

  return (
    <PageShell variant="default" className="space-y-6">
      <ProjectPageHeader
        projectId={id}
        projectName={project.name}
        title="Cuentas por pagar"
        subtitle={`${payablesTotal} ${payablesTotal === 1 ? "cuenta" : "cuentas"}`}
        actions={
          <Suspense fallback={null}>
            <ListViewToggle storageKey={`cuentas-por-pagar-${id}`} />
          </Suspense>
        }
      />

      <Suspense fallback={<ListSectionSkeleton />}>
        <PayableListSection
          payables={items}
          hrefPrefix={`/proyectos/${id}/cuentas-por-pagar`}
          supplierInvoiceHrefPrefix={`/proyectos/${id}/facturas-proveedor`}
        />
      </Suspense>

      <Suspense fallback={null}>
        <Pagination page={page} pageSize={PAGE_SIZE} total={payablesTotal} />
      </Suspense>
    </PageShell>
  );
}
