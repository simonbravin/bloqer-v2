import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ProjectTable, ProjectFilters } from "@/features/projects";
import { Pagination } from "@/components/ui/pagination";
import { getCurrentUser } from "@/lib/auth";
import { listProjects, ServiceError } from "@bloqer/services";

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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Proyectos</h1>
        <Button asChild>
          <Link href="/proyectos/nuevo">+ Nuevo proyecto</Link>
        </Button>
      </div>

      <ProjectFilters />

      <ProjectTable projects={result.data} />

      <Pagination page={page} pageSize={PAGE_SIZE} total={result.total} />
    </div>
  );
}
