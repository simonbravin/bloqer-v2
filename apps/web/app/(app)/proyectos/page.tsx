import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { ListViewToggle } from "@/components/ui/list-view-toggle";
import { ProjectListSection, ProjectFilters, ProjectListExportButton } from "@/features/projects";
import { Pagination } from "@/components/ui/pagination";
import { getCurrentUser } from "@/lib/auth";
import { listProjects, ServiceError } from "@bloqer/services";
import { PageShell } from "@/components/layout/page-shell";
import { PageListHeader } from "@/components/ui/page-list-header";
import { ListSectionSkeleton } from "@/components/ui/list-section-skeleton";

interface PageProps {
  searchParams: Promise<Record<string, string | undefined>>;
}

const PAGE_SIZE = 20;

export default async function ProyectosPage({ searchParams }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1));
  const status = sp.status as Parameters<typeof listProjects>[0]["status"];
  const search = sp.search;

  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  let result = { data: [] as Awaited<ReturnType<typeof listProjects>>["data"], total: 0 };
  try {
    result = await listProjects({ status, search, page, pageSize: PAGE_SIZE }, ctx);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "FORBIDDEN") redirect("/dashboard");
    throw err;
  }

  return (
    <PageShell variant="default" className="space-y-6">
      <PageListHeader
        title="Proyectos"
        subtitle={`${result.total} ${result.total === 1 ? "proyecto" : "proyectos"}`}
        actions={
          <>
            <ProjectListExportButton projects={result.data} />
            <Button asChild>
              <Link href="/proyectos/nuevo">+ Nuevo proyecto</Link>
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <ProjectFilters />
        <Suspense fallback={null}>
          <ListViewToggle storageKey="proyectos" />
        </Suspense>
      </div>

      <Suspense fallback={<ListSectionSkeleton />}>
        <ProjectListSection projects={result.data} />
      </Suspense>

      <Pagination page={page} pageSize={PAGE_SIZE} total={result.total} />
    </PageShell>
  );
}
