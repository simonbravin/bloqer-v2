import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { Pagination } from "@/components/ui/pagination";
import { Button } from "@/components/ui/button";
import { ListViewToggle } from "@/components/ui/list-view-toggle";
import { ListSectionSkeleton } from "@/components/ui/list-section-skeleton";
import { ProjectPageHeader } from "@/components/layout/project-page-header";
import { CollectionListSection } from "@/features/collections";
import type { CollectionListItem } from "@/features/collections";
import { getCurrentUser } from "@/lib/auth";
import { getProjectShellInfo, listCollectionsByProject, ServiceError } from "@bloqer/services";
import { PageShell } from "@/components/layout/page-shell";

const PAGE_SIZE = 20;

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}

export default async function CobranzasPage({ params, searchParams }: PageProps) {
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

  let collectionsResult;
  try {
    collectionsResult = await listCollectionsByProject(id, ctx, { page, pageSize: PAGE_SIZE });
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  const collections = collectionsResult.data;
  const collectionsTotal = collectionsResult.total;

  const items: CollectionListItem[] = collections.map((c) => ({
    id: c.id,
    projectId: c.projectId,
    collectionDate: c.collectionDate,
    accountName: c.accountName,
    currency: c.currency,
    amount: c.amount,
    notes: c.notes,
    status: c.status,
  }));

  return (
    <PageShell variant="default" className="space-y-6">
      <ProjectPageHeader
        projectId={id}
        projectName={project.name}
        title="Cobranzas"
        subtitle={`${collectionsTotal} ${collectionsTotal === 1 ? "cobranza" : "cobranzas"}`}
        actions={
          <>
            <Suspense fallback={null}>
              <ListViewToggle storageKey={`cobranzas-${id}`} />
            </Suspense>
            <Button asChild>
              <Link href={`/proyectos/${id}/cobranzas/nueva`}>+ Nueva cobranza</Link>
            </Button>
          </>
        }
      />

      <Suspense fallback={<ListSectionSkeleton />}>
        <CollectionListSection collections={items} projectId={id} />
      </Suspense>

      <Suspense fallback={null}>
        <Pagination page={page} pageSize={PAGE_SIZE} total={collectionsTotal} />
      </Suspense>
    </PageShell>
  );
}
