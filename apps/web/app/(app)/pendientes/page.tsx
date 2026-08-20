import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getMyFieldPendingItems, listFieldProjects, assertPreferredProjectAccess, ServiceError, type FieldPendingGroup } from "@bloqer/services";
import { getCurrentUser } from "@/lib/auth";
import { buildTenantServiceContext } from "@/lib/tenant-service-context";
import { PageShell } from "@/components/layout/page-shell";
import { FieldPendingInbox } from "@/features/field/components/field-pending-inbox";
import { LAST_PROJECT_COOKIE, isProjectIdValue } from "@/lib/last-project-cookie";

const GROUPS = new Set<FieldPendingGroup>(["compras", "obra", "certificaciones"]);

interface PageProps {
  searchParams: Promise<{ grupo?: string; proyecto?: string }>;
}

export default async function PendientesPage({ searchParams }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");
  const ctx = await buildTenantServiceContext();
  if (!ctx) redirect("/login");

  const sp = await searchParams;
  const group = sp.grupo && GROUPS.has(sp.grupo as FieldPendingGroup) ? (sp.grupo as FieldPendingGroup) : undefined;
  const projectId = isProjectIdValue(sp.proyecto) ? sp.proyecto : undefined;
  if (projectId) {
    try {
      await assertPreferredProjectAccess(projectId, ctx);
    } catch (err) {
      if (
        err instanceof ServiceError &&
        (err.code === "NOT_FOUND" || err.code === "FORBIDDEN" || err.code === "VALIDATION")
      ) {
        redirect("/pendientes");
      }
      throw err;
    }
  }

  const jar = await cookies();
  const last = jar.get(LAST_PROJECT_COOKIE)?.value;
  const obraHref = isProjectIdValue(last) ? `/proyectos/${last}` : "/proyectos";

  const [list, projects] = await Promise.all([
    getMyFieldPendingItems(ctx, { group, projectId }),
    listFieldProjects(ctx).catch(() => []),
  ]);

  return (
    <PageShell variant="default" className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Pendientes</h1>
        <p className="text-sm text-muted-foreground">Cosas que todavía requieren tu acción. No es el historial de notificaciones.</p>
      </div>
      <FieldPendingInbox
        list={list}
        group={group}
        projectId={projectId}
        projects={projects.map((p) => ({ id: p.id, code: p.code }))}
        obraHref={obraHref}
      />
    </PageShell>
  );
}
