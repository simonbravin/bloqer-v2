import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DataTableSection } from "@/components/ui/data-table-section";
import { TableScroll } from "@/components/ui/table-scroll";
import { PageBackLink } from "@/components/layout/page-back-link";
import { DetailField, DetailFieldGrid } from "@/components/ui/detail-field-grid";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@bloqer/domain";
import { isStorageConfigured } from "@bloqer/config";
import { getJobsiteLogById, getJobsiteLogActivityLog, getWbsIncrementalProgressSnapshot, listEntityDocuments, listStockMovements, ServiceError } from "@bloqer/services";
import {
  JobsiteLogStatusBadge,
  JobsiteLogIssueSeverityBadge,
  JobsiteLogIssueTypeBadge,
  JobsiteLogLifecycleDialog,
} from "@/features/jobsite-log";
import { EntityDocumentsPanel } from "@/features/documents";
import { ReportExportActions } from "@/features/reports";
import {
  submitJobsiteLogAction,
  approveJobsiteLogAction,
  returnJobsiteLogAction,
  cancelJobsiteLogAction,
} from "../actions";
import { formatDateLong, formatDateTime } from "@/lib/format";
import { PageShell } from "@/components/layout/page-shell";

interface PageProps {
  params: Promise<{ id: string; logId: string }>;
}

function canContributeJobsiteLog(roles: Parameters<typeof can>[0]): boolean {
  return can(roles, "EDIT", "JOBSITE_LOG") || can(roles, "EDIT", "PROJECTS");
}

function canSuperviseJobsiteLog(roles: Parameters<typeof can>[0]): boolean {
  return can(roles, "APPROVE", "JOBSITE_LOG") || can(roles, "EDIT", "PROJECTS");
}

export default async function ParteObraDetailPage({ params }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id: projectId, logId } = await params;
  const roles = current.tenantCtx.roles;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles,
  };

  let log;
  let activityLog;
  let wbsProgressSnapshot: Awaited<ReturnType<typeof getWbsIncrementalProgressSnapshot>> = {};
  let materialStockMovements: Awaited<ReturnType<typeof listStockMovements>> = [];
  try {
    [log, activityLog] = await Promise.all([
      getJobsiteLogById(logId, ctx),
      getJobsiteLogActivityLog(logId, ctx),
    ]);
    wbsProgressSnapshot = await getWbsIncrementalProgressSnapshot(projectId, ctx, {
      excludeLogId: log.status === "APPROVED" ? logId : undefined,
    });

    const consumableMaterialIds = log.materials
      .filter((m) => m.productId && m.warehouseId)
      .map((m) => m.id);
    if (log.status === "APPROVED" && consumableMaterialIds.length > 0) {
      try {
        materialStockMovements = await listStockMovements(
          {
            sourceType: "CONSUMPTION",
            sourceIds: consumableMaterialIds,
            projectId,
            status: "CONFIRMED",
          },
          ctx,
        );
      } catch (err) {
        if (!(err instanceof ServiceError && err.code === "FORBIDDEN")) throw err;
      }
    }
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  if (log.projectId !== projectId) notFound();

  const logAttachments = await listEntityDocuments("JOBSITE_LOG", logId, ctx, { projectId });
  const storageConfigured = isStorageConfigured();
  const canEditAttachments = canContributeJobsiteLog(roles);
  const canContribute = canContributeJobsiteLog(roles);
  const canSupervise = canSuperviseJobsiteLog(roles);
  const showEditLink = log.status === "DRAFT" && canContribute;

  const wasUpdated =
    log.updatedAt.getTime() - log.createdAt.getTime() > 1000 ||
    activityLog.updatedByName !== activityLog.createdByName;

  const stockMovementByMaterialId = new Map(
    materialStockMovements
      .filter((sm): sm is (typeof materialStockMovements)[number] & { sourceId: string } => sm.sourceId != null)
      .map((sm) => [sm.sourceId, sm]),
  );

  const progressRows = log.progress.map((p, idx) => {
    const approved = parseFloat(wbsProgressSnapshot[p.wbsNodeId]?.approvedIncrementalPct ?? "0");
    let logSum = 0;
    for (let j = 0; j <= idx; j++) {
      const row = log.progress[j]!;
      if (row.wbsNodeId === p.wbsNodeId && row.physicalPct) {
        logSum += parseFloat(row.physicalPct);
      }
    }
    return { ...p, cumulativePct: approved + logSum };
  });

  return (
    <PageShell variant="default" className="space-y-6">
      <div className="space-y-4">
        <PageBackLink href={`/proyectos/${projectId}/libro-obra`} label="Libro de obra" />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">{formatDateLong(log.logDate)}</h1>
              <JobsiteLogStatusBadge status={log.status} />
            </div>
            {(log.title || log.workFront) && (
              <p className="text-sm text-muted-foreground">
                {[log.title, log.workFront].filter(Boolean).join(" · ")}
              </p>
            )}
            <p className="text-sm text-muted-foreground">
              {activityLog.createdByName ? `Creado por ${activityLog.createdByName}` : "Parte de obra"}
              {" · "}
              {formatDateTime(new Date(log.createdAt))}
              {wasUpdated ? (
                <>
                  {" · "}
                  Última modificación por {activityLog.updatedByName ?? "—"}
                  {" · "}
                  {formatDateTime(new Date(log.updatedAt))}
                </>
              ) : null}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <JobsiteLogLifecycleDialog
              status={log.status}
              entries={activityLog.entries}
              canContribute={canContribute}
              canSupervise={canSupervise}
              onSubmit={submitJobsiteLogAction.bind(null, logId, projectId)}
              onReturn={returnJobsiteLogAction.bind(null, logId, projectId)}
              onApprove={approveJobsiteLogAction.bind(null, logId, projectId)}
              onCancel={cancelJobsiteLogAction.bind(null, logId, projectId)}
            />
            {showEditLink && (
              <Button variant="outline" size="sm" asChild>
                <Link href={`/proyectos/${projectId}/libro-obra/${logId}/editar`}>Editar</Link>
              </Button>
            )}
            <ReportExportActions
              exportPath={`/api/reports/proyectos/${projectId}/libro-obra/${logId}/export`}
              params={{}}
              pdfOnly
            />
          </div>
        </div>
      </div>

      {log.status === "DRAFT" && log.returnNotes && (
        <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-4 dark:bg-yellow-950/20">
          <p className="mb-1 text-xs font-medium uppercase text-yellow-700 dark:text-yellow-400">
            Observaciones de devolución
          </p>
          <p className="text-sm">{log.returnNotes}</p>
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Resumen del día</CardTitle>
        </CardHeader>
        <CardContent>
          <DetailFieldGrid columns={3}>
            <DetailField label="Turno">{log.shift ?? "—"}</DetailField>
            <DetailField label="Clima">{log.weather ?? "—"}</DetailField>
            <DetailField label="Frente de trabajo">{log.workFront ?? "—"}</DetailField>
          </DetailFieldGrid>
        </CardContent>
      </Card>

      {[
        { label: "Notas generales", value: log.generalNotes },
        { label: "Impedimentos", value: log.blockers },
        { label: "Incidentes", value: log.incidents },
        { label: "Observaciones de seguridad", value: log.safetyNotes },
      ]
        .filter((f) => f.value)
        .map((f) => (
          <div key={f.label} className="rounded-lg border bg-card p-4">
            <p className="mb-1 text-xs uppercase text-muted-foreground">{f.label}</p>
            <p className="whitespace-pre-wrap text-sm">{f.value}</p>
          </div>
        ))}

      {log.progress.length > 0 && (
        <DataTableSection title="Avance de obra">
          <TableScroll>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Partida WBS</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                  <TableHead className="text-right">% del día</TableHead>
                  <TableHead className="text-right">Acumulado</TableHead>
                  <TableHead>Notas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {progressRows.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-xs">
                      {p.wbsNode.code} — {p.wbsNode.name}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{p.description ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {parseFloat(p.quantityCompleted).toLocaleString("es-AR", {
                        minimumFractionDigits: 2,
                      })}{" "}
                      {p.wbsNode.unit}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {p.physicalPct ? `${p.physicalPct}%` : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-mono text-xs">
                      {p.cumulativePct.toFixed(2).replace(/\.?0+$/, "")} / 100
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {p.notes ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableScroll>
        </DataTableSection>
      )}

      {log.labor.length > 0 && (
        <DataTableSection title="Mano de obra">
          <TableScroll>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Contacto / Subcontrato</TableHead>
                  <TableHead>Descripción cuadrilla</TableHead>
                  <TableHead className="text-right">Trabajadores</TableHead>
                  <TableHead className="text-right">Horas</TableHead>
                  <TableHead>Notas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {log.labor.map((lb) => (
                  <TableRow key={lb.id}>
                    <TableCell>{lb.contactName ?? lb.subcontractCode ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {lb.crewDescription ?? "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{lb.workersCount}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {lb.hoursWorked ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {lb.notes ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableScroll>
        </DataTableSection>
      )}

      {log.materials.length > 0 && (
        <DataTableSection title="Materiales utilizados">
          <TableScroll>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Descripción</TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead>Depósito</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                  <TableHead>Consumo inventario</TableHead>
                  <TableHead>Notas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {log.materials.map((m) => {
                  const movement = stockMovementByMaterialId.get(m.id);
                  const showConsumption = m.productId && m.warehouseId;
                  return (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">{m.description}</TableCell>
                    <TableCell className="text-muted-foreground">{m.productName ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {m.warehouseName ?? "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {parseFloat(m.quantity).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-xs">
                      {!showConsumption ? (
                        <span className="text-muted-foreground">—</span>
                      ) : log.status === "APPROVED" ? (
                        movement ? (
                          <Link
                            href="/inventario/movimientos"
                            className="text-primary hover:underline"
                          >
                            Registrado · {formatDateLong(new Date(movement.movementDate))}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">Sin movimiento</span>
                        )
                      ) : (
                        <span className="text-muted-foreground">Al aprobar</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {m.notes ?? "—"}
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableScroll>
        </DataTableSection>
      )}

      {log.issues.length > 0 && (
        <DataTableSection title="Problemas / Incidencias">
          <TableScroll>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Severidad</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Notas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {log.issues.map((iss) => (
                  <TableRow key={iss.id}>
                    <TableCell>
                      <JobsiteLogIssueTypeBadge
                        type={iss.type as "INCIDENT" | "BLOCKER" | "SAFETY" | "OTHER"}
                      />
                    </TableCell>
                    <TableCell>
                      <JobsiteLogIssueSeverityBadge
                        severity={iss.severity as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"}
                      />
                    </TableCell>
                    <TableCell>{iss.description}</TableCell>
                    <TableCell className="text-xs capitalize text-muted-foreground">
                      {iss.status.toLowerCase()}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {iss.notes ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableScroll>
        </DataTableSection>
      )}

      <EntityDocumentsPanel
        scope={{ kind: "project", projectId }}
        linkedEntity={{ type: "JOBSITE_LOG", id: logId }}
        storageConfigured={storageConfigured}
        docs={logAttachments}
        canEdit={canEditAttachments}
      />
    </PageShell>
  );
}
