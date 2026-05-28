import { formatDate } from "@/lib/format";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { ListEmptyState } from "@/components/ui/list-empty-state";
import { TableScroll } from "@/components/ui/table-scroll";
import { ListSectionSkeleton } from "@/components/ui/list-section-skeleton";
import { ProjectPageHeader } from "@/components/layout/project-page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getCurrentUser } from "@/lib/auth";
import {
  getProjectShellInfo,
  getScheduleLinkedWbsNodeIds,
  listJobsiteLogsByProject,
  ServiceError,
} from "@bloqer/services";
import { JobsiteLogStatusBadge } from "@/features/jobsite-log";
import { PageShell } from "@/components/layout/page-shell";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function LibroObraPage({ params }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id: projectId } = await params;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  let project;
  try {
    project = await getProjectShellInfo(projectId, ctx);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    if (err instanceof ServiceError && err.code === "FORBIDDEN") redirect("/dashboard");
    throw err;
  }

  let logs;
  let scheduleWbsIds = new Set<string>();
  try {
    [logs, scheduleWbsIds] = await Promise.all([
      listJobsiteLogsByProject(projectId, ctx),
      getScheduleLinkedWbsNodeIds(projectId, ctx).then((ids) => new Set(ids)),
    ]);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  return (
    <PageShell variant="default" className="space-y-6">
      <ProjectPageHeader
        projectId={projectId}
        projectName={project.name}
        title="Libro de obra"
        subtitle={`${logs.length} ${logs.length === 1 ? "parte" : "partes"}`}
        actions={
          <Button asChild>
            <Link href={`/proyectos/${projectId}/libro-obra/nuevo`}>+ Nuevo parte</Link>
          </Button>
        }
      />

      <Suspense fallback={<ListSectionSkeleton />}>
        {logs.length === 0 ? (
          <ListEmptyState message="No hay partes de obra registrados en este proyecto." />
        ) : (
          <TableScroll>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Título / Frente</TableHead>
                  <TableHead>Turno</TableHead>
                  <TableHead className="text-center">Avances</TableHead>
                  <TableHead className="text-center">MO</TableHead>
                  <TableHead className="text-center">Mat.</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((l) => {
                  const onSchedule = l.progress.some((p) => scheduleWbsIds.has(p.wbsNodeId));
                  return (
                  <TableRow key={l.id}>
                    <TableCell className="font-mono text-xs">
                      <Link
                        href={`/proyectos/${projectId}/libro-obra/${l.id}`}
                        className="text-primary hover:underline"
                      >
                        {formatDate(l.logDate)}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/proyectos/${projectId}/libro-obra/${l.id}`}
                        className="hover:underline"
                      >
                        {l.title ?? l.workFront ?? "—"}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{l.shift ?? "—"}</TableCell>
                    <TableCell className="text-center text-muted-foreground">
                      {l.progress.length}
                      {onSchedule && (
                        <span className="ml-1 inline-block rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
                          En cronograma
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-center text-muted-foreground">
                      {l.labor.length}
                    </TableCell>
                    <TableCell className="text-center text-muted-foreground">
                      {l.materials.length}
                    </TableCell>
                    <TableCell>
                      <JobsiteLogStatusBadge status={l.status} />
                    </TableCell>
                  </TableRow>
                );
                })}
              </TableBody>
            </Table>
          </TableScroll>
        )}
      </Suspense>
    </PageShell>
  );
}
