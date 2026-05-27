import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { ListSectionSkeleton } from "@/components/ui/list-section-skeleton";
import { ProjectPageHeader } from "@/components/layout/project-page-header";
import { SupplierInvoiceList } from "@/features/ap";
import type { SupplierInvoiceListItem } from "@/features/ap";
import { getCurrentUser } from "@/lib/auth";
import { getProjectShellInfo, listSupplierInvoicesByProject, ServiceError } from "@bloqer/services";
import { PageShell } from "@/components/layout/page-shell";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function FacturasProveedorPage({ params }: PageProps) {
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

  let invoices;
  try {
    invoices = await listSupplierInvoicesByProject(id, ctx);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

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
        subtitle={`${items.length} ${items.length === 1 ? "factura" : "facturas"}`}
        actions={
          <Button asChild>
            <Link href={`/proyectos/${id}/facturas-proveedor/nueva`}>Nueva factura</Link>
          </Button>
        }
      />

      <Suspense fallback={<ListSectionSkeleton />}>
        <div className="rounded-lg border bg-card">
          <div className="border-b px-6 py-4">
            <h2 className="font-semibold">Facturas del proyecto</h2>
          </div>
          <div className="p-6">
            <SupplierInvoiceList
              invoices={items}
              hrefPrefix={`/proyectos/${id}/facturas-proveedor`}
            />
          </div>
        </div>
      </Suspense>
    </PageShell>
  );
}
