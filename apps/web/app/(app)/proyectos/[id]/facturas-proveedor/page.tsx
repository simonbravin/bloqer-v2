import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { Pagination } from "@/components/ui/pagination";
import { ListSectionSkeleton } from "@/components/ui/list-section-skeleton";
import { ProjectPageHeader } from "@/components/layout/project-page-header";
import { ProjectFinanceListHeaderActions } from "@/features/projects/components/project-finance-list-header-actions";
import { SupplierInvoiceListFilters, SupplierInvoiceListSection } from "@/features/ap";
import type { SupplierInvoiceListItem } from "@/features/ap";
import { getCurrentUser } from "@/lib/auth";
import { getProjectShellInfo, listSupplierInvoicesByProject, ServiceError } from "@bloqer/services";
import { PageShell } from "@/components/layout/page-shell";
import { parsePage } from "@/lib/parse-page";

const PAGE_SIZE = 20;

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string; search?: string; sort?: string; dir?: string; view?: string }>;
}

export default async function FacturasProveedorPage({ params, searchParams }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id } = await params;
  const sp = await searchParams;
  const page = parsePage(sp.page);
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
    if (err instanceof ServiceError && err.code === "FORBIDDEN") redirect(`/proyectos/${id}`);
    throw err;
  }

  let invoicesResult;
  try {
    invoicesResult = await listSupplierInvoicesByProject(id, ctx, {
      page,
      pageSize: PAGE_SIZE,
      search: sp.search,
      sortDir: sp.dir === "asc" ? "asc" : "desc",
    });
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
    payableId: inv.payable?.id ?? null,
    payableStatus: inv.payable?.status ?? null,
  }));

  return (
    <PageShell variant="default" className="space-y-6">
      <ProjectPageHeader
        title="Facturas proveedor"
        subtitle={`${invoicesTotal} ${invoicesTotal === 1 ? "factura" : "facturas"}`}
        actions={
          <ProjectFinanceListHeaderActions
            listViewStorageKey={`facturas-proveedor-${id}`}
            secondary={{ href: `/proyectos/${id}/pagos`, label: "Ver pagos" }}
            primary={{ href: `/proyectos/${id}/facturas-proveedor/nueva`, label: "Nueva factura" }}
          />
        }
      />

      <Suspense fallback={null}>
        <SupplierInvoiceListFilters
          showDateFilters={false}
          preserveParams={["search", "sort", "dir", "view"]}
        />
      </Suspense>

      <Suspense fallback={<ListSectionSkeleton />}>
        <SupplierInvoiceListSection
          invoices={items}
          hrefPrefix={`/proyectos/${id}/facturas-proveedor`}
          payableHrefPrefix={`/proyectos/${id}/cuentas-por-pagar`}
        />
      </Suspense>

      <Suspense fallback={null}>
        <Pagination page={page} pageSize={PAGE_SIZE} total={invoicesTotal} />
      </Suspense>
    </PageShell>
  );
}
