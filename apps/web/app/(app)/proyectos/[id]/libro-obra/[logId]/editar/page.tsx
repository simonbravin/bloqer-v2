import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth";
import { getJobsiteLogById, getJobsiteLogFormPickList, listProjectWbsItemsForLog, ServiceError } from "@bloqer/services";
import { JobsiteLogForm } from "@/features/jobsite-log";
import { updateJobsiteLogAction } from "../../actions";

interface PageProps { params: Promise<{ id: string; logId: string }> }

export default async function EditarParteObraPage({ params }: PageProps) {
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

  if (log.status !== "DRAFT") redirect(`/proyectos/${projectId}/libro-obra/${logId}`);

  let wbsRaw: Awaited<ReturnType<typeof listProjectWbsItemsForLog>>;
  let pickList: Awaited<ReturnType<typeof getJobsiteLogFormPickList>>;
  try {
    [wbsRaw, pickList] = await Promise.all([
      listProjectWbsItemsForLog(projectId, ctx).catch(() => []),
      getJobsiteLogFormPickList(projectId, ctx),
    ]);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  const companyId = log.companyId || current.tenantCtx.companyId || pickList.companyId || "";

  const updateAction = async (fd: FormData) => {
    "use server";
    return updateJobsiteLogAction(logId, fd);
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/proyectos/${projectId}/libro-obra/${logId}`}>← Parte de obra</Link>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">Editar parte de obra</h1>
      </div>
      <JobsiteLogForm
        projectId={projectId}
        companyId={companyId}
        wbsOptions={wbsRaw.map((n) => ({ id: n.id, code: n.code, name: n.name, unit: n.costItem?.unit ?? "" }))}
        contactOptions={pickList.contactOptions}
        productOptions={pickList.productOptions}
        warehouseOptions={pickList.warehouseOptions}
        subcontractOptions={pickList.subcontractOptions.map((s) => ({
          id: s.id,
          code: `SC-${String(s.number).padStart(3, "0")}`,
          title: s.title,
        }))}
        action={updateAction}
        mode="edit"
        submitLabel="Guardar cambios"
        defaultValues={{
          logDate:      new Date(log.logDate).toISOString().split("T")[0]!,
          title:        log.title ?? "",
          workFront:    log.workFront ?? "",
          shift:        log.shift ?? "",
          weather:      log.weather ?? "",
          generalNotes: log.generalNotes ?? "",
          blockers:     log.blockers ?? "",
          incidents:    log.incidents ?? "",
          safetyNotes:  log.safetyNotes ?? "",
          progress: log.progress.map((p) => ({
            wbsNodeId:         p.wbsNodeId,
            description:       p.description ?? "",
            quantityCompleted: p.quantityCompleted,
            physicalPct:       p.physicalPct ?? "",
            notes:             p.notes ?? "",
          })),
          labor: log.labor.map((lb) => ({
            contactId:       lb.contactId ?? "__none__",
            subcontractId:   lb.subcontractId ?? "__none__",
            crewDescription: lb.crewDescription ?? "",
            workersCount:    String(lb.workersCount),
            hoursWorked:     lb.hoursWorked ?? "",
            notes:           lb.notes ?? "",
          })),
          materials: log.materials.map((m) => ({
            productId:   m.productId ?? "__none__",
            warehouseId: m.warehouseId ?? "__none__",
            description: m.description,
            quantity:    m.quantity,
            notes:       m.notes ?? "",
          })),
          issues: log.issues.map((iss) => ({
            type:        iss.type,
            severity:    iss.severity,
            description: iss.description,
            status:      iss.status,
            notes:       iss.notes ?? "",
          })),
        }}
      />
    </div>
  );
}
