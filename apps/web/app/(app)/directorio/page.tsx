import Link from "next/link";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { ListViewToggle } from "@/components/ui/list-view-toggle";
import { Pagination } from "@/components/ui/pagination";
import { ContactListSection } from "@/features/directory/components/contact-list-section";
import { ContactListExportButton } from "@/features/directory/components/contact-list-export-button";
import { ContactFilters } from "@/features/directory/components/contact-filters";
import { getCurrentUser } from "@/lib/auth";
import { listContacts } from "@bloqer/services";
import { redirect } from "next/navigation";
import type { ContactRoleType } from "@bloqer/database";
import { PageShell } from "@/components/layout/page-shell";
import { PageListHeader } from "@/components/ui/page-list-header";
import { ListSectionSkeleton } from "@/components/ui/list-section-skeleton";

interface PageProps {
  searchParams: Promise<{ role?: string; status?: string; search?: string; page?: string }>;
}

const PAGE_SIZE = 20;
const VALID_ROLES = ["CLIENT", "SUPPLIER", "SUBCONTRACTOR", "EMPLOYEE", "OTHER"] as const;

export default async function DirectorioPage({ searchParams }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const sp = await searchParams;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  const role = VALID_ROLES.includes(sp.role as ContactRoleType) ? (sp.role as ContactRoleType) : undefined;
  const status = sp.status === "ARCHIVED" ? "ARCHIVED" as const : sp.status === "ALL" ? undefined : "ACTIVE" as const;
  const page = Math.max(1, Number(sp.page ?? 1));

  const { data, total } = await listContacts({ role, status, search: sp.search, page, pageSize: PAGE_SIZE }, ctx);

  return (
    <PageShell variant="default" className="space-y-6">
      <PageListHeader
        title="Directorio"
        subtitle={`${total} ${total === 1 ? "contacto" : "contactos"}`}
        actions={
          <>
            <ContactListExportButton contacts={data} />
            <Button asChild>
              <Link href="/directorio/nuevo">+ Nuevo contacto</Link>
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <ContactFilters />
        <Suspense fallback={null}>
          <ListViewToggle storageKey="directorio" />
        </Suspense>
      </div>
      <Suspense fallback={<ListSectionSkeleton />}>
        <ContactListSection contacts={data} />
      </Suspense>
      <Pagination page={page} pageSize={PAGE_SIZE} total={total} />
    </PageShell>
  );
}
