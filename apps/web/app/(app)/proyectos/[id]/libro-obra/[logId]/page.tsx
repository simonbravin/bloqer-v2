import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@bloqer/domain";
import { isStorageConfigured } from "@bloqer/config";
import { getJobsiteLogById, listEntityDocuments, ServiceError } from "@bloqer/services";
import { JobsiteLogStatusBadge, JobsiteLogIssueSeverityBadge, JobsiteLogIssueTypeBadge } from "@/features/jobsite-log";
import { EntityDocumentsPanel } from "@/features/documents";
import {
  submitJobsiteLogAction,
  approveJobsiteLogAction,
  returnJobsiteLogAction,
  cancelJobsiteLogAction,
} from "../actions";

interface PageProps { params: Promise<{ id: string; logId: string }> }

export default async function ParteObraDetailPage({ params }: PageProps) {
  const current = await getCurrentUser();
  if (!current?.tenantCtx) redirect("/login");

  const { id: projectId, logId } = await params;
  const ctx = {
    actorUserId: current.session.user.id!,
    tenantId:    current.tenantCtx.tenantId,
    companyId:   current.tenantCtx.companyId,
    roles:       current.tenantCtx.roles,
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

  const doSubmit  = async () => { "use server"; await submitJobsiteLogAction(logId); };
  const doApprove = async () => { "use server"; await approveJobsiteLogAction(logId); };
  const doCancel  = async () => { "use server"; await cancelJobsiteLogAction(logId); };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/proyectos/${projectId}/libro-obra`}>← Libro de obra</Link>
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">
                {new Date(log.logDate).toLocaleDateString("es-AR", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
              </h1>
              <JobsiteLogStatusBadge status={log.status} />
            </div>
            {(log.title || log.workFront) && (
              <p className="text-sm text-muted-foreground mt-0.5">{[log.title, log.workFront].filter(Boolean).join(" · ")}</p>
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
                <Button size="sm" type="submit">Enviar</Button>
              </form>
              <form action={doCancel}>
                <Button variant="outline" size="sm" type="submit" className="text-destructive">Anular</Button>
              </form>
            </>
          )}
          {log.status === "SUBMITTED" && (
            <>
              <form action={doApprove}>
                <Button size="sm" type="submit">Aprobar</Button>
              </form>
              <ReturnForm logId={logId} />
            </>
          )}
        </div>
      </div>

      {/* Return notes */}
      {log.returnNotes && (
        <div className="rounded-lg border border-yellow-300 bg-yellow-50 dark:bg-yellow-950/20 p-4">
          <p className="text-xs font-medium text-yellow-700 dark:text-yellow-400 uppercase mb-1">Observaciones de devolución</p>
          <p className="text-sm">{log.returnNotes}</p>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground uppercase">Turno</p>
          <p className="text-sm font-medium mt-1">{log.shift ?? "—"}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground uppercase">Clima</p>
          <p className="text-sm font-medium mt-1">{log.weather ?? "—"}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground uppercase">Frente de trabajo</p>
          <p className="text-sm font-medium mt-1">{log.workFront ?? "—"}</p>
        </div>
      </div>

      {/* Text fields */}
      {[
        { label: "Notas generales", value: log.generalNotes },
        { label: "Impedimentos",    value: log.blockers },
        { label: "Incidentes",      value: log.incidents },
        { label: "Observaciones de seguridad", value: log.safetyNotes },
      ].filter((f) => f.value).map((f) => (
        <div key={f.label} className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground uppercase mb-1">{f.label}</p>
          <p className="text-sm whitespace-pre-wrap">{f.value}</p>
        </div>
      ))}

      {/* Progress */}
      {log.progress.length > 0 && (
        <div className="rounded-lg border bg-card">
          <div className="border-b px-6 py-4"><h2 className="font-semibold">Avance de obra</h2></div>
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase">
              <tr>
                <th className="px-4 py-2 text-left">Partida WBS</th>
                <th className="px-4 py-2 text-left">Descripción</th>
                <th className="px-4 py-2 text-right">Cantidad</th>
                <th className="px-4 py-2 text-right">% Físico</th>
                <th className="px-4 py-2 text-left">Notas</th>
              </tr>
            </thead>
            <tbody>
              {log.progress.map((p) => (
                <tr key={p.id} className="border-t">
                  <td className="px-4 py-2 font-mono text-xs">{p.wbsNode.code} — {p.wbsNode.name}</td>
                  <td className="px-4 py-2 text-muted-foreground">{p.description ?? "—"}</td>
                  <td className="px-4 py-2 text-right">{parseFloat(p.quantityCompleted).toLocaleString("es-AR", { minimumFractionDigits: 2 })} {p.wbsNode.unit}</td>
                  <td className="px-4 py-2 text-right">{p.physicalPct ? `${p.physicalPct}%` : "—"}</td>
                  <td className="px-4 py-2 text-muted-foreground text-xs">{p.notes ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Labor */}
      {log.labor.length > 0 && (
        <div className="rounded-lg border bg-card">
          <div className="border-b px-6 py-4"><h2 className="font-semibold">Mano de obra</h2></div>
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase">
              <tr>
                <th className="px-4 py-2 text-left">Contacto / Subcontrato</th>
                <th className="px-4 py-2 text-left">Descripción cuadrilla</th>
                <th className="px-4 py-2 text-right">Trabajadores</th>
                <th className="px-4 py-2 text-right">Horas</th>
                <th className="px-4 py-2 text-left">Notas</th>
              </tr>
            </thead>
            <tbody>
              {log.labor.map((lb) => (
                <tr key={lb.id} className="border-t">
                  <td className="px-4 py-2 text-sm">
                    {lb.contactName ?? lb.subcontractCode ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">{lb.crewDescription ?? "—"}</td>
                  <td className="px-4 py-2 text-right">{lb.workersCount}</td>
                  <td className="px-4 py-2 text-right">{lb.hoursWorked ?? "—"}</td>
                  <td className="px-4 py-2 text-muted-foreground text-xs">{lb.notes ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Materials */}
      {log.materials.length > 0 && (
        <div className="rounded-lg border bg-card">
          <div className="border-b px-6 py-4"><h2 className="font-semibold">Materiales utilizados</h2></div>
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase">
              <tr>
                <th className="px-4 py-2 text-left">Descripción</th>
                <th className="px-4 py-2 text-left">Producto</th>
                <th className="px-4 py-2 text-left">Depósito</th>
                <th className="px-4 py-2 text-right">Cantidad</th>
                <th className="px-4 py-2 text-left">Notas</th>
              </tr>
            </thead>
            <tbody>
              {log.materials.map((m) => (
                <tr key={m.id} className="border-t">
                  <td className="px-4 py-2 font-medium">{m.description}</td>
                  <td className="px-4 py-2 text-muted-foreground">{m.productName ?? "—"}</td>
                  <td className="px-4 py-2 text-muted-foreground">{m.warehouseName ?? "—"}</td>
                  <td className="px-4 py-2 text-right">{parseFloat(m.quantity).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</td>
                  <td className="px-4 py-2 text-muted-foreground text-xs">{m.notes ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Issues */}
      {log.issues.length > 0 && (
        <div className="rounded-lg border bg-card">
          <div className="border-b px-6 py-4"><h2 className="font-semibold">Problemas / Incidencias</h2></div>
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase">
              <tr>
                <th className="px-4 py-2 text-left">Tipo</th>
                <th className="px-4 py-2 text-left">Severidad</th>
                <th className="px-4 py-2 text-left">Descripción</th>
                <th className="px-4 py-2 text-left">Estado</th>
                <th className="px-4 py-2 text-left">Notas</th>
              </tr>
            </thead>
            <tbody>
              {log.issues.map((iss) => (
                <tr key={iss.id} className="border-t">
                  <td className="px-4 py-2">
                    <JobsiteLogIssueTypeBadge type={iss.type as "INCIDENT" | "BLOCKER" | "SAFETY" | "OTHER"} />
                  </td>
                  <td className="px-4 py-2">
                    <JobsiteLogIssueSeverityBadge severity={iss.severity as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"} />
                  </td>
                  <td className="px-4 py-2">{iss.description}</td>
                  <td className="px-4 py-2 text-muted-foreground text-xs capitalize">{iss.status.toLowerCase()}</td>
                  <td className="px-4 py-2 text-muted-foreground text-xs">{iss.notes ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <EntityDocumentsPanel
        scope={{ kind: "project", projectId }}
        linkedEntity={{ type: "JOBSITE_LOG", id: logId }}
        storageConfigured={storageConfigured}
        docs={logAttachments}
        canEdit={canEditAttachments}
      />
    </div>
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
      <input name="returnNotes" placeholder="Observaciones de devolución…" required className="h-8 px-2 text-sm border rounded w-64" />
      <Button variant="outline" size="sm" type="submit" className="text-destructive">Devolver</Button>
    </form>
  );
}
