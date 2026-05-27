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
import { getJobsiteLogById, listEntityDocuments, ServiceError } from "@bloqer/services";
import {
  JobsiteLogStatusBadge,
  JobsiteLogIssueSeverityBadge,
  JobsiteLogIssueTypeBadge,
} from "@/features/jobsite-log";
import { EntityDocumentsPanel } from "@/features/documents";
import {
  submitJobsiteLogAction,
  approveJobsiteLogAction,
  returnJobsiteLogAction,
  cancelJobsiteLogAction,
} from "../actions";
import { formatDateLong } from "@/lib/format";
import { PageShell } from "@/components/layout/page-shell";

interface PageProps {
  params: Promise<{ id: string; logId: string }>;
}

export default async function ParteObraDetailPage({ params }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id: projectId, logId } = await params;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId: current.tenantCtx.tenantId,
    companyId: current.tenantCtx.companyId,
    roles: current.tenantCtx.roles,
  };

  let log;
  try {
    log = await getJobsiteLogById(logId, ctx);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  if (log.projectId !== projectId) notFound();

  const logAttachments = await listEntityDocuments("JOBSITE_LOG", logId, ctx, { projectId });
  const storageConfigured = isStorageConfigured();
  const canEditAttachments = can(current.tenantCtx.roles, "EDIT", "JOBSITE_LOG");

  const doSubmit = async () => {
    "use server";
    await submitJobsiteLogAction(logId);
  };
  const doApprove = async () => {
    "use server";
    await approveJobsiteLogAction(logId);
  };
  const doCancel = async () => {
    "use server";
    await cancelJobsiteLogAction(logId);
  };

  return (
    <PageShell variant="default" className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <PageBackLink href={`/proyectos/${projectId}/libro-obra`} label="Libro de obra" />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">{formatDateLong(log.logDate)}</h1>
              <JobsiteLogStatusBadge status={log.status} />
            </div>
            {(log.title || log.workFront) && (
              <p className="text-sm text-muted-foreground mt-0.5">
                {[log.title, log.workFront].filter(Boolean).join(" · ")}
              </p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {log.status === "DRAFT" && (
            <>
              <Button variant="outline" size="sm" asChild>
                <Link href={`/proyectos/${projectId}/libro-obra/${logId}/editar`}>Editar</Link>
              </Button>
              <form action={doSubmit}>
                <Button size="sm" type="submit">
                  Enviar
                </Button>
              </form>
              <form action={doCancel}>
                <Button variant="outline" size="sm" type="submit" className="text-destructive">
                  Anular
                </Button>
              </form>
            </>
          )}
          {log.status === "SUBMITTED" && (
            <>
              <form action={doApprove}>
                <Button size="sm" type="submit">
                  Aprobar
                </Button>
              </form>
              <ReturnForm logId={logId} />
            </>
          )}
        </div>
      </div>

      {/* Return notes */}
      {log.returnNotes && (
        <div className="rounded-lg border border-yellow-300 bg-yellow-50 dark:bg-yellow-950/20 p-4">
          <p className="text-xs font-medium text-yellow-700 dark:text-yellow-400 uppercase mb-1">
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

      {/* Text fields */}
      {[
        { label: "Notas generales", value: log.generalNotes },
        { label: "Impedimentos", value: log.blockers },
        { label: "Incidentes", value: log.incidents },
        { label: "Observaciones de seguridad", value: log.safetyNotes },
      ]
        .filter((f) => f.value)
        .map((f) => (
          <div key={f.label} className="rounded-lg border bg-card p-4">
            <p className="text-xs text-muted-foreground uppercase mb-1">{f.label}</p>
            <p className="text-sm whitespace-pre-wrap">{f.value}</p>
          </div>
        ))}

      {/* Progress */}
      {log.progress.length > 0 && (
        <DataTableSection title="Avance de obra">
          <TableScroll>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Partida WBS</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                  <TableHead className="text-right">% Físico</TableHead>
                  <TableHead>Notas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {log.progress.map((p) => (
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
                    <TableCell className="text-muted-foreground text-xs">
                      {p.notes ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableScroll>
        </DataTableSection>
      )}

      {/* Labor */}
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
                    <TableCell className="text-muted-foreground text-xs">
                      {lb.notes ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableScroll>
        </DataTableSection>
      )}

      {/* Materials */}
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
                  <TableHead>Notas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {log.materials.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">{m.description}</TableCell>
                    <TableCell className="text-muted-foreground">{m.productName ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {m.warehouseName ?? "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {parseFloat(m.quantity).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {m.notes ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableScroll>
        </DataTableSection>
      )}

      {/* Issues */}
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
                    <TableCell className="text-muted-foreground text-xs capitalize">
                      {iss.status.toLowerCase()}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
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

// Inline return form — needs returnNotes text input + server action
function ReturnForm({ logId }: { logId: string }) {
  async function doReturn(fd: FormData) {
    "use server";
    await returnJobsiteLogAction(logId, fd);
  }
  return (
    <form action={doReturn} className="flex gap-2 items-center">
      <input
        name="returnNotes"
        placeholder="Observaciones de devolución…"
        required
        className="h-8 px-2 text-sm border rounded w-64"
      />
      <Button variant="outline" size="sm" type="submit" className="text-destructive">
        Devolver
      </Button>
    </form>
  );
}
