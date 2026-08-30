import { notFound, redirect } from "next/navigation";
import {
  getMyFieldPendingItems,
  getProjectShellInfo,
  parseFieldPendingGroup,
  ServiceError,
} from "@bloqer/services";
import { getCurrentUser } from "@/lib/auth";
import { PageShell } from "@/components/layout/page-shell";
import { ProjectPageHeader } from "@/components/layout/project-page-header";
import { FieldPendingInbox } from "@/features/field/components/field-pending-inbox";
import { isProjectIdSegment } from "@/lib/project-route";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ grupo?: string }>;
}

export default async function ProyectoPendientesPage({ params, searchParams }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id: projectId } = await params;
  if (!isProjectIdSegment(projectId)) notFound();
  const sp = await searchParams;
  const group = parseFieldPendingGroup(sp.grupo);

  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  let shell;
  try {
    shell = await getProjectShellInfo(projectId, ctx);
  } catch (err) {
    if (err instanceof ServiceError && (err.code === "NOT_FOUND" || err.code === "FORBIDDEN")) notFound();
    throw err;
  }

  const list = await getMyFieldPendingItems(ctx, { group, projectId });

  return (
    <PageShell variant="default" className="space-y-4">
      <ProjectPageHeader
        title="Pendientes"
        subtitle="Acciones de esta obra, en orden. Compras: SC → OC → confirmar → recibir → factura. No es el historial de notificaciones."
      />
      <FieldPendingInbox
        list={list}
        group={group}
        projectId={projectId}
        projects={[{ id: shell.id, code: shell.code }]}
        lockProject
      />
    </PageShell>
  );
}
