import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { Pagination } from "@/components/ui/pagination";
import { ListViewToggle } from "@/components/ui/list-view-toggle";
import { ListSectionSkeleton } from "@/components/ui/list-section-skeleton";
import { ProjectPageHeader } from "@/components/layout/project-page-header";
import { PaymentListSection } from "@/features/ap";
import type { PaymentListItem } from "@/features/ap";
import { getCurrentUser } from "@/lib/auth";
import { getProjectShellInfo, listPaymentsByProject, ServiceError } from "@bloqer/services";
import { PageShell } from "@/components/layout/page-shell";

const PAGE_SIZE = 20;

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}

export default async function PagosPage({ params, searchParams }: PageProps) {
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

  let paymentsResult;
  try {
    paymentsResult = await listPaymentsByProject(id, ctx, { page, pageSize: PAGE_SIZE });
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  const payments = paymentsResult.data;
  const paymentsTotal = paymentsResult.total;

  const items: PaymentListItem[] = payments.map((p) => ({
    id: p.id,
    paymentDate: p.paymentDate,
    amount: p.amount,
    currency: p.currency,
    status: p.status,
    accountName: p.accountName,
    supplierInvoiceId: p.supplierInvoiceId,
  }));

  return (
    <PageShell variant="default" className="space-y-6">
      <ProjectPageHeader
        projectId={id}
        projectName={project.name}
        title="Pagos"
        subtitle={`${paymentsTotal} ${paymentsTotal === 1 ? "pago" : "pagos"}`}
        actions={
          <Suspense fallback={null}>
            <ListViewToggle storageKey={`pagos-${id}`} />
          </Suspense>
        }
      />

      <Suspense fallback={<ListSectionSkeleton />}>
        <PaymentListSection payments={items} hrefPrefix={`/proyectos/${id}/pagos`} />
      </Suspense>

      <Suspense fallback={null}>
        <Pagination page={page} pageSize={PAGE_SIZE} total={paymentsTotal} />
      </Suspense>
    </PageShell>
  );
}
