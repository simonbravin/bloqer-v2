import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { formatDateTime } from "@/lib/format";
import { getCurrentUser } from "@/lib/auth";
import { buildTenantServiceContext } from "@/lib/tenant-service-context";
import {
  canManageScheduledReports,
  getProjectShellInfo,
  listScheduledReports,
  ServiceError,
} from "@bloqer/services";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageShell } from "@/components/layout/page-shell";
import { ProjectPageHeader } from "@/components/layout/project-page-header";
import {
  SCHEDULED_REPORT_RUN_STATUS_LABEL,
  SCHEDULED_REPORT_STATUS_LABEL,
  runStatusBadgeVariant,
} from "@/features/scheduled-reports/scheduled-report-labels";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableScroll } from "@/components/ui/table-scroll";

type Props = { params: Promise<{ id: string }> };

export default async function ProjectReportesProgramadosPage({ params }: Props) {
  const { id: projectId } = await params;
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const ctx = await buildTenantServiceContext();
  if (!ctx) redirect("/login");
  if (!canManageScheduledReports(ctx)) notFound();

  let project;
  try {
    project = await getProjectShellInfo(projectId, ctx);
  } catch (e) {
    if (e instanceof ServiceError && e.code === "NOT_FOUND") notFound();
    if (e instanceof ServiceError && e.code === "FORBIDDEN") redirect("/dashboard");
    throw e;
  }

  const rows = await listScheduledReports(ctx, { projectId });

  return (
    <PageShell variant="default" className="space-y-6">
      <ProjectPageHeader
        projectId={projectId}
        projectName={project.name}
        title="Envíos programados"
        subtitle="Reportes por email automáticos para esta obra. Ver detalle e historial de ejecuciones en cada envío."
        actions={
          <Button asChild>
            <Link href={`/configuracion/reportes/nuevo?scope=PROJECT&projectId=${projectId}`}>
              Nuevo envío
            </Link>
          </Button>
        }
      />

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay envíos programados para este proyecto.</p>
      ) : (
        <TableScroll>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Próxima ejecución</TableHead>
                <TableHead>Última corrida</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-[80px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-sm">{formatDateTime(r.nextRunAt)}</TableCell>
                  <TableCell className="text-sm">
                    {r.lastRunAt ? (
                      <>
                        {formatDateTime(r.lastRunAt)}
                        {r.lastRunStatus ? (
                          <Badge variant={runStatusBadgeVariant(r.lastRunStatus)} className="mt-1">
                            {SCHEDULED_REPORT_RUN_STATUS_LABEL[r.lastRunStatus]}
                          </Badge>
                        ) : null}
                      </>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={r.status === "ACTIVE" ? "default" : "secondary"}>
                      {SCHEDULED_REPORT_STATUS_LABEL[r.status]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/configuracion/reportes/${r.id}`}>Ver</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableScroll>
      )}
    </PageShell>
  );
}
