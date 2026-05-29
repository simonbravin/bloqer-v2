import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { Pagination } from "@/components/ui/pagination";
import { Button } from "@/components/ui/button";
import { ListViewToggle } from "@/components/ui/list-view-toggle";
import { ListSectionSkeleton } from "@/components/ui/list-section-skeleton";
import { ProjectPageHeader } from "@/components/layout/project-page-header";
import { SupplierInvoiceListSection } from "@/features/ap";
import type { SupplierInvoiceListItem } from "@/features/ap";
import { getCurrentUser } from "@/lib/auth";
import { getProjectShellInfo, listSupplierInvoicesByProject, ServiceError } from "@bloqer/services";
import { PageShell } from "@/components/layout/page-shell";

const PAGE_SIZE = 20;

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}

export default async function FacturasProveedorPage({ params, searchParams }: PageProps) {
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

  let invoicesResult;
  try {
    invoicesResult = await listSupplierInvoicesByProject(id, ctx, { page, pageSize: PAGE_SIZE });
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  const invoices = invoicesResult.data;
  const invoicesTotal = invoicesResult.total;

  const items: SupplierInvoiceListItem[] = invoices.map((inv) => ({
    id: inv.id,
    code: inv.code,
    supplierName: inv.supplierName,
    issueDate: inv.issueDate,
    dueDate: inv.dueDate,
    totalAmount: inv.totalAmount,
    currency: inv.currency,
    status: inv.status,
  }));

  return (
    <PageShell variant="default" className="space-y-6">
      <ProjectPageHeader
        projectId={id}
        projectName={project.name}
        title="Facturas de proveedor"
        subtitle={`${invoicesTotal} ${invoicesTotal === 1 ? "factura" : "facturas"}`}
        actions={
          <>
            <Suspense fallback={null}>
              <ListViewToggle storageKey={`facturas-proveedor-${id}`} />
            </Suspense>
            <Button asChild>
              <Link href={`/proyectos/${id}/facturas-proveedor/nueva`}>Nueva factura</Link>
            </Button>
          </>
        }
      />

      <Suspense fallback={<ListSectionSkeleton />}>
        <SupplierInvoiceListSection
          invoices={items}
          hrefPrefix={`/proyectos/${id}/facturas-proveedor`}
        />
      </Suspense>

      <Suspense fallback={null}>
        <Pagination page={page} pageSize={PAGE_SIZE} total={invoicesTotal} />
      </Suspense>
    </PageShell>
  );
}
