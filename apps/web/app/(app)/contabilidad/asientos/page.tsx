import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { ListViewToggle } from "@/components/ui/list-view-toggle";
import { Pagination } from "@/components/ui/pagination";
import { JournalEntryListSection } from "@/features/accounting/components/journal-entry-list-section";
import { getCurrentUser } from "@/lib/auth";
import { buildTenantServiceContext } from "@/lib/tenant-service-context";
import { listJournalEntries } from "@bloqer/services";
import { can } from "@bloqer/domain";
import { companyQueryFilter, type EmpresaSearch } from "@/lib/accounting-search-params";
import { PageBackLink } from "@/components/layout/page-back-link";
import { PageShell } from "@/components/layout/page-shell";
import { PageListHeader } from "@/components/ui/page-list-header";
import { ListSectionSkeleton } from "@/components/ui/list-section-skeleton";

const PAGE_SIZE = 20;

export default async function AsientosPage({
  searchParams,
}: {
  searchParams: Promise<EmpresaSearch & { page?: string }>;
}) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");
  if (!can(current.tenantCtx.roles, "VIEW", "ACCOUNTING")) redirect("/dashboard");

  const sp = await searchParams;
  const ctx = (await buildTenantServiceContext())!;
  const cf = companyQueryFilter(sp);
  const page = Math.max(1, Number(sp.page ?? 1));
  const { data: entries, total } = await listJournalEntries(ctx, {
    companyId: cf.companyId ?? null,
    page,
    pageSize: PAGE_SIZE,
  });

  const empresa = cf.companyId;
  const q = empresa ? `?empresa=${encodeURIComponent(empresa)}` : "";

  return (
    <PageShell variant="default" className="space-y-6">
      <PageBackLink href="/contabilidad" label="Contabilidad" />
      <PageListHeader
        title="Asientos"
        subtitle={`${total} ${total === 1 ? "asiento" : "asientos"}`}
        actions={
          <>
            <Suspense fallback={null}>
              <ListViewToggle storageKey="asientos" />
            </Suspense>
            {can(current.tenantCtx.roles, "EDIT", "ACCOUNTING") && (
              <Button asChild>
                <Link href={`/contabilidad/asientos/nuevo${q}`}>+ Nuevo asiento</Link>
              </Button>
            )}
          </>
        }
      />

      <Suspense fallback={<ListSectionSkeleton />}>
        <JournalEntryListSection entries={entries} empresa={empresa} />
      </Suspense>
      <Pagination page={page} pageSize={PAGE_SIZE} total={total} />
    </PageShell>
  );
}
