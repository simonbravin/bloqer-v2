import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { ListViewToggle } from "@/components/ui/list-view-toggle";
import { Pagination } from "@/components/ui/pagination";
import { getCurrentUser } from "@/lib/auth";
import { listProducts } from "@bloqer/services";
import { ProductListSection } from "@/features/inventory/components/product-list-section";
import { PageBackLink } from "@/components/layout/page-back-link";
import { PageShell } from "@/components/layout/page-shell";
import { PageListHeader } from "@/components/ui/page-list-header";
import { ListSectionSkeleton } from "@/components/ui/list-section-skeleton";

const PAGE_SIZE = 20;

export default async function ProductosPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1));
  const { data: products, total } = await listProducts({ page, pageSize: PAGE_SIZE }, ctx);

  return (
    <PageShell variant="default" className="space-y-6">
      <PageBackLink href="/inventario" label="Inventario" />
      <PageListHeader
        title="Productos"
        subtitle={`${total} ${total === 1 ? "producto" : "productos"}`}
        actions={
          <>
            <Suspense fallback={null}>
              <ListViewToggle storageKey="productos" />
            </Suspense>
            <Button asChild>
              <Link href="/inventario/productos/nuevo">Nuevo producto</Link>
            </Button>
          </>
        }
      />

      <Suspense fallback={<ListSectionSkeleton />}>
        <ProductListSection products={products} />
      </Suspense>
      <Pagination page={page} pageSize={PAGE_SIZE} total={total} />
    </PageShell>
  );
}
