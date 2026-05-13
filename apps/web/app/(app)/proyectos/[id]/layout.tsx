import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  buildProjectSubnavLinks,
  ProjectStatusBadge,
  ProjectSubnav,
} from "@/features/projects";
import { getCurrentUser } from "@/lib/auth";
import {
  getProjectShellInfo,
  getTenantModuleGate,
  ServiceError,
} from "@bloqer/services";

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}

export default async function ProjectScopedLayout({ children, params }: LayoutProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id } = await params;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  let shell: Awaited<ReturnType<typeof getProjectShellInfo>>;
  let gate: Awaited<ReturnType<typeof getTenantModuleGate>>;
  try {
    [shell, gate] = await Promise.all([
      getProjectShellInfo(id, ctx),
      getTenantModuleGate(ctx),
    ]);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    if (err instanceof ServiceError && err.code === "FORBIDDEN") redirect("/dashboard");
    throw err;
  }

  const subnavItems = buildProjectSubnavLinks(id, gate, current.tenantCtx.roles);

  return (
    <>
      <div className="border-b bg-background">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3 sm:items-center">
            <Link
              href="/proyectos"
              className="inline-flex shrink-0 items-center rounded-md px-2 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              ← Proyectos
            </Link>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-xl font-bold tracking-tight sm:text-2xl">{shell.name}</h1>
                <ProjectStatusBadge status={shell.status} />
              </div>
              <p className="font-mono text-sm text-muted-foreground">{shell.code}</p>
            </div>
          </div>
        </div>
        <div className="mx-auto max-w-5xl">
          <ProjectSubnav items={subnavItems} />
        </div>
      </div>
      {children}
    </>
  );
}
