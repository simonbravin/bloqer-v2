import { notFound, redirect } from "next/navigation";
import { formatDate } from "@/lib/format";
import Link from "next/link";
import { Suspense } from "react";
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
  getJobsiteLogFormPickList,
  getProjectShellInfo,
  getPrimaryScheduleItemIdsByWbs,
  getScheduleLinkedWbsNodeIds,
  getWbsIncrementalProgressSnapshot,
  hasLegacyPhysicalPctOverflow,
  listJobsiteLogsByProject,
  listProjectWbsItemsForLog,
  ServiceError,
} from "@bloqer/services";
import {
  JobsiteLogListFilters,
  JobsiteLogStatusBadge,
  JobsiteLogWorkspaceView,
  NewJobsiteLogDialog,
  type JobsiteLogListRow,
} from "@/features/jobsite-log";
import { PageShell } from "@/components/layout/page-shell";
import { createJobsiteLogAction, getStockBalancePreviewAction } from "./actions";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    dateFrom?: string;
    dateTo?: string;
    wbsNodeId?: string;
    status?: string;
    create?: string;
  }>;
}

export default async function LibroObraPage({ params, searchParams }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id: projectId } = await params;
  const sp = await searchParams;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  try {
    await getProjectShellInfo(projectId, ctx);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    if (err instanceof ServiceError && err.code === "FORBIDDEN") redirect("/dashboard");
    throw err;
  }

  const filters = {
    dateFrom: sp.dateFrom,
    dateTo: sp.dateTo,
    wbsNodeId: sp.wbsNodeId,
    status: sp.status,
  };
  const hasFilters = Boolean(sp.dateFrom || sp.dateTo || sp.wbsNodeId || sp.status);

  let logs: Awaited<ReturnType<typeof listJobsiteLogsByProject>> = [];
  let scheduleItemByWbs = new Map<string, string>();
  let filterError: string | null = null;
  let wbsLoadError = false;

  // Form picklists independent of list filters — CONFLICT on filters must not wipe WBS options.
  const [pickList, wbsProgressSnapshot, scheduleWbsIds, wbsOptions] = await Promise.all([
    getJobsiteLogFormPickList(projectId, ctx),
    getWbsIncrementalProgressSnapshot(projectId, ctx),
    getScheduleLinkedWbsNodeIds(projectId, ctx).then((ids) => new Set(ids)),
    listProjectWbsItemsForLog(projectId, ctx).catch(() => {
      wbsLoadError = true;
      return [] as Awaited<ReturnType<typeof listProjectWbsItemsForLog>>;
    }),
  ]);

  try {
    logs = await listJobsiteLogsByProject(projectId, filters, ctx);
    const wbsIdsForLinks = [
      ...new Set(logs.flatMap((l) => l.progress.map((p) => p.wbsNodeId))),
    ].filter((id) => scheduleWbsIds.has(id));
    scheduleItemByWbs = await getPrimaryScheduleItemIdsByWbs(
      projectId,
      wbsIdsForLinks,
      ctx,
    );
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    if (err instanceof ServiceError && err.code === "CONFLICT") {
      filterError = err.message;
      logs = [];
    } else {
      throw err;
    }
  }

  const companyId = pickList.companyId || current.tenantCtx.companyId || "";
  const formWbsOptions = wbsOptions.map((n) => ({
    id: n.id,
    code: n.code,
    name: n.name,
    unit: n.costItem?.unit ?? "",
    budgetQty: n.costItem?.quantity?.toString(),
  }));

  const subtitleParts = [`${logs.length} ${logs.length === 1 ? "parte" : "partes"}`];
  if (hasFilters) subtitleParts.push("filtrado");

  return (
    <PageShell variant="default" className="space-y-6">
      <ProjectPageHeader
        title="Libro de obra"
        subtitle={subtitleParts.join(" · ")}
        actions={
          <Suspense fallback={null}>
            <NewJobsiteLogDialog
              projectId={projectId}
              companyId={companyId}
              wbsOptions={formWbsOptions}
              contactOptions={pickList.contactOptions}
              productOptions={pickList.productOptions}
              warehouseOptions={pickList.warehouseOptions}
              subcontractOptions={pickList.subcontractOptions.map((s) => ({
                id: s.id,
                code: `SC-${String(s.number).padStart(3, "0")}`,
                title: s.title,
              }))}
              wbsProgressSnapshot={wbsProgressSnapshot}
              legacyPhysicalPctWarning={hasLegacyPhysicalPctOverflow(wbsProgressSnapshot)}
              inventoryModuleEnabled={pickList.inventoryModuleEnabled}
              stockPreviewAction={getStockBalancePreviewAction}
              action={createJobsiteLogAction}
              defaultOpen={sp.create === "1"}
            />
          </Suspense>
        }
      />

      <JobsiteLogListFilters
        wbsOptions={wbsOptions.map((n) => ({
          id: n.id,
          code: n.code,
          name: n.name,
          unit: n.costItem?.unit ?? "",
        }))}
      />

      {filterError && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {filterError}
        </p>
      )}

      {wbsLoadError && (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
          No se pudieron cargar las partidas EDT para el filtro.
        </p>
      )}

      <Suspense fallback={<ListSectionSkeleton />}>
        {logs.length === 0 ? (
          <ListEmptyState
            message={
              filterError
                ? "Corregí los filtros para ver partes."
                : hasFilters
                  ? "No hay partes que coincidan con los filtros."
                  : "No hay partes de obra registrados en este proyecto."
            }
          />
        ) : (
          <JobsiteLogWorkspaceView
            projectId={projectId}
            logs={logs.map(
              (l): JobsiteLogListRow => ({
                id: l.id,
                logDate: l.logDate,
                status: l.status,
                title: l.title,
                workFront: l.workFront,
              }),
            )}
            table={
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
                      const onSchedule = l.progress.some((p) =>
                        scheduleWbsIds.has(p.wbsNodeId),
                      );
                      const scheduleItemId = l.progress
                        .map((p) => scheduleItemByWbs.get(p.wbsNodeId))
                        .find((id): id is string => Boolean(id));
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
                              <Link
                                href={
                                  scheduleItemId
                                    ? `/proyectos/${projectId}/cronograma?itemId=${scheduleItemId}`
                                    : `/proyectos/${projectId}/cronograma`
                                }
                                className="ml-1 inline-block rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary hover:underline"
                              >
                                En cronograma
                              </Link>
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
            }
          />
        )}
      </Suspense>
    </PageShell>
  );
}
